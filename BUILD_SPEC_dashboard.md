# BUILD SPEC — Dashboard Pelaporan Pelanggaran Pemilu

Admin dashboard for receiving, storing, reviewing and analysing election
violation reports. Reports will eventually arrive from an AI chat intake bot
(WhatsApp / web). For now they arrive through a manual simulation form.

Feed this whole file to the model. Build it in order. Do not skip Section 2.

---

## 0. STACK (fixed, do not substitute)

- Next.js 15, App Router, TypeScript, `src/` directory
- Tailwind CSS v4
- shadcn/ui for components
- Supabase (Postgres + Auth + Storage)
- `@supabase/ssr` for auth (NOT the deprecated `@supabase/auth-helpers-nextjs`)
- Recharts for charts
- `date-fns` with Indonesian locale for date formatting
- Deploy target: Vercel
- All UI copy in **Bahasa Indonesia**. Code, comments, variable names in English.

---

## 1. HARD CONSTRAINTS

Read these before writing any code. Most of them are the opposite of the
default thing to do.

1. **No public registration.** There is no signup page, no signup route, no
   "create account" link anywhere on the public surface. Signups are disabled
   in Supabase. The only way an account exists is an existing admin creating it
   from inside the app.

2. **No email anywhere.** No magic links, no email confirmation, no password
   reset emails, no SMTP config. Login is **username + password**. See Section 3
   for how this maps onto Supabase Auth.

3. **The database must never reject a report.** Every content column is
   nullable. There are no `CHECK` constraints on any field the AI populates.
   There are no foreign keys on any field the AI populates. A report with
   nothing but a single line of garbled text must still insert successfully and
   still appear in the list.

4. **Never discard the original.** Whatever the intake sends is stored verbatim
   in `payload` and `raw_transcript` before any parsing happens. Normalisation
   is lossy; the original is not.

5. **Normalise on read, not on write.** If the AI sends
   `category: "politik uang bagi bagi sembako"`, store that string as-is in
   `category_raw`, map it to a known bucket in `category`, and if no bucket
   matches use `lainnya`. Never drop the value, never throw.

6. **This is allegation data about named private individuals.** Anonymous
   access is denied at the RLS level, every status change is written to an audit
   table, and attachments are served only through short-lived signed URLs.
   No public read path exists, not even by obscure ID.

7. **No integrations.** No WhatsApp, no n8n, no email, no webhooks out. Build
   the inbound API route (Section 7) because it costs nothing now and saves a
   refactor later, but wire nothing to it.

---

## 2. DATABASE

Run as a single migration in the Supabase SQL editor.

```sql
-- ============================================================ extensions
create extension if not exists "pgcrypto";

-- ============================================================ profiles
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text,
  role        text not null default 'admin',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

comment on column public.profiles.role is 'admin = full access; viewer = read only';

-- ============================================================ reports
-- DESIGN RULE: only id, ticket, created_at, status, priority are NOT NULL.
-- Everything else is nullable because the AI intake is unreliable by nature.
create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  ticket              text unique not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- workflow (admin controlled, safe to constrain)
  status              text not null default 'baru',
  priority            text not null default 'normal',
  report_class        text,          -- 'informasi_awal' | 'laporan'

  -- syarat materiel (Perbawaslu 7/2022 Pasal 15 ayat 4)
  incident_at         timestamptz,   -- parsed, may be null
  incident_at_text    text,          -- what the reporter actually said
  narrative           text,
  location_text       text,          -- free text as given
  desa                text,
  kecamatan           text,
  kabupaten           text,
  provinsi            text,

  -- terlapor
  reported_party      text,
  reported_party_role text,

  -- dugaan
  category            text,          -- normalised bucket
  category_raw        text,          -- exactly what the AI said
  item_given          text,
  item_value          numeric,
  item_value_text     text,          -- "sekitar 50 ribuan" stays readable
  recipients_estimate integer,
  witness_count       integer,

  -- syarat formal (Pasal 15 ayat 3)
  identity_disclosed  boolean not null default false,
  reporter_name       text,
  reporter_address    text,
  reporter_contact    text,

  -- evidence
  has_evidence        boolean not null default false,
  evidence_note       text,

  -- the escape hatch: anything the schema did not anticipate
  extra               jsonb not null default '{}'::jsonb,

  -- provenance
  source              text not null default 'manual',  -- manual|api|whatsapp|web
  source_meta         jsonb not null default '{}'::jsonb,
  payload             jsonb not null default '{}'::jsonb,  -- original, untouched
  raw_transcript      text,

  -- derived
  completeness        integer not null default 0,
  parse_warnings      text[] not null default '{}',

  -- review
  admin_notes         text,
  reviewed_by         uuid references public.profiles(id),
  reviewed_at         timestamptz,

  is_archived         boolean not null default false
);

-- Only workflow fields get constrained. Nothing the AI writes to is constrained.
alter table public.reports
  add constraint reports_status_check
  check (status in ('baru','ditinjau','diteruskan','ditutup','bukan_pelanggaran','duplikat'));

alter table public.reports
  add constraint reports_priority_check
  check (priority in ('normal','urgent'));

create index reports_created_at_idx   on public.reports (created_at desc);
create index reports_status_idx       on public.reports (status);
create index reports_priority_idx     on public.reports (priority);
create index reports_category_idx     on public.reports (category);
create index reports_kecamatan_idx    on public.reports (kecamatan);
create index reports_kabupaten_idx    on public.reports (kabupaten);
create index reports_incident_at_idx  on public.reports (incident_at desc);
create index reports_extra_gin_idx    on public.reports using gin (extra);

-- full text search across the free-text fields
create index reports_fts_idx on public.reports using gin (
  to_tsvector('simple',
    coalesce(narrative,'') || ' ' ||
    coalesce(location_text,'') || ' ' ||
    coalesce(reported_party,'') || ' ' ||
    coalesce(ticket,'') || ' ' ||
    coalesce(raw_transcript,'')
  )
);

-- ============================================================ attachments
create table public.attachments (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  file_name   text,
  mime_type   text,
  size_bytes  bigint,
  caption     text,
  created_at  timestamptz not null default now()
);

create index attachments_report_id_idx on public.attachments (report_id);

-- ============================================================ audit trail
create table public.report_events (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  actor_id    uuid references public.profiles(id),
  event_type  text not null,   -- created|status_changed|priority_changed|note_added|edited|archived
  from_value  text,
  to_value    text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index report_events_report_id_idx on public.report_events (report_id, created_at desc);

-- ============================================================ ticket generator
create sequence if not exists report_ticket_seq;

create or replace function public.generate_ticket()
returns text language plpgsql as $$
declare
  n bigint;
begin
  n := nextval('report_ticket_seq');
  return 'LP-' || to_char(now(), 'YYMM') || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ============================================================ completeness
-- 0-100 score of how close this report is to meeting Perbawaslu requirements.
-- Materiel is weighted heavier than formal because materiel is what makes a
-- report actionable as Informasi Awal.
create or replace function public.calc_completeness(r public.reports)
returns integer language plpgsql immutable as $$
declare s integer := 0;
begin
  -- syarat materiel (70)
  if coalesce(r.narrative,'') <> ''                     then s := s + 25; end if;
  if r.incident_at is not null
     or coalesce(r.incident_at_text,'') <> ''           then s := s + 15; end if;
  if coalesce(r.kecamatan,'') <> ''
     or coalesce(r.location_text,'') <> ''              then s := s + 15; end if;
  if r.has_evidence                                     then s := s + 15; end if;
  -- syarat formal (30)
  if coalesce(r.reported_party,'') <> ''                then s := s + 15; end if;
  if r.identity_disclosed
     and coalesce(r.reporter_name,'') <> ''             then s := s + 15; end if;
  return least(s, 100);
end;
$$;

create or replace function public.reports_before_write()
returns trigger language plpgsql as $$
begin
  if new.ticket is null or new.ticket = '' then
    new.ticket := public.generate_ticket();
  end if;

  new.completeness := public.calc_completeness(new);
  new.updated_at := now();

  -- report_class follows Perbawaslu: formal requirements met => Laporan
  if new.report_class is null then
    if new.identity_disclosed
       and coalesce(new.reporter_name,'') <> ''
       and coalesce(new.reporter_address,'') <> '' then
      new.report_class := 'laporan';
    else
      new.report_class := 'informasi_awal';
    end if;
  end if;

  return new;
end;
$$;

create trigger reports_before_write_trg
  before insert or update on public.reports
  for each row execute function public.reports_before_write();

-- ============================================================ RLS
alter table public.profiles      enable row level security;
alter table public.reports       enable row level security;
alter table public.attachments   enable row level security;
alter table public.report_events enable row level security;

-- Authenticated users only. Anonymous gets nothing, anywhere.
create policy "auth read profiles"  on public.profiles
  for select to authenticated using (true);

create policy "auth read reports"   on public.reports
  for select to authenticated using (true);
create policy "auth write reports"  on public.reports
  for update to authenticated using (true);
create policy "auth insert reports" on public.reports
  for insert to authenticated with check (true);

create policy "auth read attach"    on public.attachments
  for select to authenticated using (true);
create policy "auth insert attach"  on public.attachments
  for insert to authenticated with check (true);

create policy "auth read events"    on public.report_events
  for select to authenticated using (true);
create policy "auth insert events"  on public.report_events
  for insert to authenticated with check (true);

-- NOTE: no policy grants anon anything. The API ingest route (Section 7)
-- uses the service role key server-side and bypasses RLS deliberately.

-- ============================================================ storage
insert into storage.buckets (id, name, public)
values ('report-attachments', 'report-attachments', false)
on conflict (id) do nothing;

create policy "auth read attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'report-attachments');

create policy "auth upload attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'report-attachments');
```

---

## 3. AUTH WITHOUT EMAIL

Supabase Auth requires an email field. We satisfy it with a synthetic internal
domain and never send anything to it.

**Mapping:** username `budi` becomes `budi@internal.lapor` in `auth.users`.
The user never sees this. The login form has one field labelled
**"Nama pengguna"** and one labelled **"Kata sandi"**.

**Supabase dashboard settings to apply manually (document these in README):**
- Authentication → Providers → Email: **enabled** (it is the password backend)
- Authentication → Providers → Email → **Confirm email: OFF**
- Authentication → Sign In / Providers → **Allow new users to sign up: OFF**
- Do not configure SMTP

**Login flow:** form posts username + password → server action appends
`@internal.lapor` → `signInWithPassword`. On failure show a single generic
message: `Nama pengguna atau kata sandi salah.` Never reveal which was wrong.

**Account creation flow (`/admin/users`, admin role only):**
1. Server action validates caller's session and confirms `profiles.role = 'admin'`
2. Uses `supabase.auth.admin.createUser()` with the **service role key**,
   `email_confirm: true` so the synthetic address is pre-confirmed
3. Inserts the matching `profiles` row with `created_by`
4. Returns the generated password **once** on screen, plainly, with a note to
   copy it now. There is no email to send it to and no reset flow.

**Password reset:** an admin sets a new password for a user via
`auth.admin.updateUserById`. There is no self-service reset. Say so in the UI.

**First admin bootstrap:** a script `scripts/create-first-admin.ts` run locally
with `npx tsx`, reading service role key from `.env.local`. Document it in the
README. This is the only way the first account comes into existence.

**Middleware:** `src/middleware.ts` refreshes the session and redirects any
unauthenticated request to `/login`, except `/login` itself and `/api/reports`.
Protect everything else including the root.

---

## 4. ROUTES

```
/login                  public. username + password. no signup link.
/                       dashboard: stats + charts + recent reports
/reports                list: filters, search, sort, pagination
/reports/[id]           detail: full record, evidence, status, notes, audit log
/reports/new            manual entry / AI simulation form
/admin/users            admin only: list users, create user, set password, deactivate
/api/reports            POST only. ingest endpoint. shared-secret header.
```

---

## 5. THE INTAKE FORM (`/reports/new`)

This is the stand-in for the AI. Its purpose is to prove the pipeline handles
realistic and unrealistic input, so build it to be **permissive**.

**Two tabs:**

**Tab 1 — "Formulir"** — structured fields, grouped and labelled in Indonesian:

- *Kejadian*: Uraian kejadian (textarea, the only visually emphasised field),
  Tanggal kejadian (date, optional), Keterangan waktu (text, e.g. "kemarin
  malam", "abis isya"), Lokasi (text), Desa/Kelurahan, Kecamatan,
  Kabupaten/Kota, Provinsi
- *Terlapor*: Nama/ciri terlapor, Jabatan atau peran
- *Dugaan*: Kategori (combobox — **free text allowed, not a closed select**),
  Bentuk pemberian, Nilai (number), Keterangan nilai (text),
  Perkiraan penerima (number), Jumlah saksi (number)
- *Bukti*: Ada bukti (toggle), Keterangan bukti, file upload (images, multiple)
- *Pelapor*: Identitas dicantumkan (toggle). When off, the name/address/contact
  fields **disable and grey out** rather than disappear, so the operator sees
  they were deliberately skipped.
- *Lain-lain*: a repeatable key/value pair editor writing into `extra`
- *Prioritas*: normal / urgent

**Every field except Uraian kejadian is optional.** Submitting with only a
narrative must succeed. Submitting with only whitespace shows one inline
message, `Isi uraian kejadian minimal satu kalimat.`, and does not clear the form.

**Tab 2 — "Tempel JSON"** — a textarea accepting a raw JSON payload, exactly
what the AI will POST later. A "Muat contoh" button cycles through the test
payloads in Section 8. On parse it fills Tab 1 and shows any
`parse_warnings` as amber chips above the form — it does not block submission.
Invalid JSON shows the parser error and offers a "Simpan sebagai teks mentah"
button that files it with `raw_transcript` set and everything else null.

---

## 6. NORMALISATION LAYER

`src/lib/normalize.ts`. Pure functions, unit-testable, **never throws**.

```ts
export type ParseResult<T> = { value: T | null; warning?: string };

normalizeCategory(input: unknown): ParseResult<string>
normalizeDate(input: unknown): ParseResult<string>
normalizeNumber(input: unknown): ParseResult<number>
normalizeBoolean(input: unknown): ParseResult<boolean>
normalizePriority(input: unknown): ParseResult<'normal' | 'urgent'>
normalizeReport(payload: unknown): { row: ReportInsert; warnings: string[] }
```

Behaviour rules:

- **Category buckets:** `politik_uang`, `penyalahgunaan_fasilitas`,
  `intimidasi_kekerasan`, `pelanggaran_kampanye`, `pelanggaran_pemungutan`,
  `kode_etik`, `bukan_pelanggaran`, `lainnya`.
  Match by keyword against a synonym map (`uang`, `sembako`, `serangan fajar`,
  `bagi-bagi` → `politik_uang`; `ancam`, `todong`, `pukul` → `intimidasi_kekerasan`;
  and so on). **Always** store the untouched input in `category_raw`. Unmatched
  → `lainnya` + warning. Never null, never throw.
- **Dates:** accept ISO, `DD/MM/YYYY`, `DD-MM-YYYY`, and Indonesian relative
  terms (`kemarin`, `tadi malam`, `minggu lalu`, `2 hari lalu`). Whatever the
  input, the original string always lands in `incident_at_text`. Unparseable →
  `incident_at` null + warning. **A future date parses fine but raises a
  warning** rather than being rejected.
- **Numbers:** strip `Rp`, thousands separators, and spaces. Handle `50rb`,
  `50 ribu`, `2jt`, `2 juta`. Ranges like `50-100rb` take the lower bound and
  warn. Non-numeric goes to `item_value_text` only.
- **Unknown top-level keys go into `extra` verbatim.** Never dropped, never an
  error. This is the whole point of the column.
- Any key whose name matches `/nik|ktp|rekening|npwp|passport/i` is
  **dropped and replaced** with a `parse_warnings` entry
  `"Data identitas sensitif ditolak: <key>"`. Do not store it even in `extra`.

---

## 7. INGEST API (`POST /api/reports`)

Build it, leave it unconnected.

- Auth: header `x-intake-secret` compared against `INTAKE_SECRET` env var using
  a **timing-safe comparison**. Mismatch → 401.
- Body: arbitrary JSON. No schema validation at the boundary.
- Pipeline: store `payload` verbatim → run `normalizeReport` → insert via
  service role client → write a `report_events` row with `event_type: 'created'`.
- **Always returns 200 if the row was written**, even with a dozen warnings.
  Response: `{ ticket, id, warnings: string[] }`.
- Returns 500 only on a genuine database failure. Never 400 for bad content.
- Rate limit: 30 requests per minute per IP, in-memory is fine.
- Log every request body to `payload` before parsing so nothing is ever lost to
  a parser bug.

---

## 8. TEST PAYLOADS

Seed script `scripts/seed.ts` inserts these plus ~40 generated reports spread
across the last 60 days, several kecamatan, all categories, ~30% urgent,
~40% with identity disclosed. Every one of these must insert successfully.

```jsonc
// 1. clean and complete
{ "narrative": "Ada pembagian uang Rp 50.000 per orang di RT 03 sambil diminta memilih calon nomor 2.",
  "incident_at": "2026-02-11T20:30:00+07:00", "desa": "Sukamaju", "kecamatan": "Cibiru",
  "kabupaten": "Bandung", "category": "politik uang", "item_given": "uang tunai",
  "item_value": 50000, "recipients_estimate": 40, "witness_count": 3,
  "has_evidence": true, "identity_disclosed": true, "reporter_name": "Budi Santoso",
  "reporter_address": "Sukamaju, Cibiru", "reporter_contact": "0812xxxxxxx" }

// 2. minimum viable — must still insert
{ "narrative": "bagi bagi duit di kampung" }

// 3. messy Indonesian, relative time, fuzzy value
{ "narrative": "td malem ada yg bagi2 amplop abis isya deket masjid",
  "incident_at_text": "tadi malam", "location_text": "deket masjid al ikhlas",
  "item_value_text": "50rban kayaknya", "category": "kayanya money politic" }

// 4. unknown fields — must land in extra, not error
{ "narrative": "Sembako dibagikan sambil kampanye.", "kecamatan": "Lembang",
  "cuaca": "hujan", "nomor_tps": "TPS 14", "mood_pelapor": "marah",
  "random_field_from_ai": { "nested": true, "count": 7 } }

// 5. wrong types throughout — must coerce or warn, never throw
{ "narrative": 12345, "witness_count": "banyak banget", "item_value": "Rp 100.000,-",
  "identity_disclosed": "iya", "incident_at": "kemarin", "priority": "SANGAT URGENT" }

// 6. sensitive data — must be stripped with a warning
{ "narrative": "Saya melihat pembagian uang.", "reporter_name": "Siti",
  "reporter_nik": "3273010101900001", "nomor_rekening": "1234567890" }

// 7. empty-ish — should fail validation on the form, succeed via API as raw
{ "raw_transcript": "halo?? ini gimana ya" }

// 8. very long narrative (generate ~8000 chars) — must not truncate
{ "narrative": "<8000 chars>" }

// 9. urgent path
{ "narrative": "Saya diancam akan dipecat kalau tidak memilih calon tertentu.",
  "category": "intimidasi", "priority": "urgent", "kecamatan": "Cicendo" }

// 10. future date — warn, do not reject
{ "narrative": "Kejadian pembagian sembako.", "incident_at": "2027-12-31" }
```

---

## 9. DASHBOARD (`/`)

**Stat cards:** Total laporan · Belum ditinjau · Urgent aktif · Laporan resmi
vs Informasi Awal (ratio) · Rata-rata kelengkapan (%) · Masuk 7 hari terakhir

**Charts (Recharts):**
- Line: reports per day, last 30 days, urgent as a second series
- Bar: count by category, descending
- Horizontal bar: top 10 kecamatan
- Donut: status distribution
- Stacked bar: identity disclosed vs not, by category

**Analysis panels:**
- *Terlapor paling sering disebut* — group by normalised `reported_party`, top
  10 with counts. Header must read `Disebut dalam N laporan (dugaan, belum
  diverifikasi)`. This label is required, not optional.
- *Estimasi nilai* — sum and median of `item_value` where category is
  `politik_uang`, with the count of reports that had no value recorded shown
  alongside. Never present the sum as a total without that denominator.
- *Kualitas laporan* — completeness score distribution, and which field is most
  often missing
- *Kecepatan tindak lanjut* — median hours from `created_at` to first status
  change

**Filters** apply to the whole dashboard: date range, kabupaten, kecamatan,
category, status, priority. Persist in URL search params so views are shareable.

---

## 10. REPORT LIST AND DETAIL

**List (`/reports`)**
- Columns: Tiket · Tanggal masuk · Kategori (badge) · Kecamatan · Status (badge)
  · Prioritas · Kelengkapan (progress bar) · Identitas (icon)
- Urgent rows get a left border accent and sort to the top by default
- Filters: status, priority, category, kabupaten, kecamatan, date range,
  identity disclosed, has evidence
- Full-text search over narrative, location, reported party, ticket
- Server-side pagination, 25 per page
- Bulk select → change status, archive
- Export filtered set to CSV

**Detail (`/reports/[id]`)**
- Header: ticket, status badge, priority badge, report_class badge, timestamps
- Left column: all structured fields, grouped like the form. **Empty fields
  render as `— belum diisi —` in muted text, never hidden**, so a reviewer can
  see what is missing at a glance.
- `extra` renders as a key/value table with a "Lihat JSON mentah" disclosure
- `parse_warnings` render as amber chips at the top
- Attachments: thumbnail grid, click for lightbox, served via signed URLs with
  a 60-second expiry generated per request
- `raw_transcript` in a collapsed monospace block
- Right column: status dropdown, priority toggle, admin notes (markdown
  textarea, autosave on blur), and the full audit log from `report_events`
- Admins can edit any field inline; every edit writes a `report_events` row
  with `from_value` and `to_value`

---

## 11. FILE TREE

```
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx                 # shell: sidebar, user menu, auth guard
    (app)/page.tsx                   # dashboard
    (app)/reports/page.tsx
    (app)/reports/new/page.tsx
    (app)/reports/[id]/page.tsx
    (app)/admin/users/page.tsx
    api/reports/route.ts
    layout.tsx
    globals.css
  components/
    ui/                              # shadcn
    dashboard/                       # stat-card, charts, analysis panels
    reports/                         # table, filters, form, json-tab, detail panels
    admin/                           # user-table, create-user-dialog
  lib/
    supabase/{client,server,admin,middleware}.ts
    normalize.ts
    normalize.test.ts
    queries.ts                       # all report/analytics reads
    actions.ts                       # server actions
    constants.ts                     # categories, statuses, synonym map, labels
    format.ts                        # id-ID dates, rupiah
  types/database.ts                  # generated: supabase gen types typescript
  middleware.ts
scripts/
  create-first-admin.ts
  seed.ts
supabase/migrations/0001_init.sql
.env.example
README.md
```

---

## 12. ENVIRONMENT

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server only. never referenced in a client component.
INTAKE_SECRET=                 # shared secret for POST /api/reports
```

Add a build-time assertion that `SUPABASE_SERVICE_ROLE_KEY` is never imported
into a file marked `"use client"`.

---

## 13. UI NOTES

- Sidebar layout, light mode default, dark mode toggle
- Indonesian throughout: `Beranda`, `Laporan`, `Laporan Baru`, `Pengguna`,
  `Keluar`
- Dates via `date-fns` with `id` locale: `11 Feb 2026, 20:30`
- Currency as `Rp 50.000`
- Category badges: distinct colours, `intimidasi_kekerasan` in red
- Empty states with real copy, e.g. `Belum ada laporan yang masuk.`
- Loading skeletons on every async surface
- Mobile: list collapses to cards; the dashboard is desktop-first and may scroll
- Toasts for every mutation
- Confirmation dialog for archive and for status change to `ditutup`

---

## 14. DEFINITION OF DONE

The build is finished when all of these hold:

1. `npm run build` passes with zero TypeScript errors
2. Visiting `/` while logged out redirects to `/login`
3. There is no route, link, or server action anywhere that creates an account
   without an authenticated admin session
4. All ten payloads in Section 8 POST to `/api/reports` and return 200
5. Payload 5 (every field the wrong type) inserts without throwing, and its
   detail page renders without crashing
6. Payload 6 inserts with NIK and account number absent from the row, from
   `extra`, and from `payload`, with warnings recorded
7. Submitting the form with only a narrative succeeds
8. The dashboard renders correctly with zero reports in the database
9. The dashboard renders correctly with 500 seeded reports
10. `SUPABASE_SERVICE_ROLE_KEY` appears in no client bundle
11. An anonymous `curl` to the Supabase REST endpoint for `reports` returns no
    rows
12. Every status change appears in the detail page audit log with actor and
    timestamp

---

## 15. BUILD ORDER

1. Scaffold, Tailwind, shadcn, Supabase clients
2. Migration + seed script + generated types
3. Auth: middleware, login, bootstrap script, session guard
4. `normalize.ts` **with its tests first** — this is the load-bearing piece
5. Ingest API route, verified against all ten payloads
6. Report list and detail
7. Intake form, both tabs
8. Dashboard and analytics
9. Admin user management
10. Polish, empty states, mobile pass

Do not move to step 5 until step 4's tests pass. Everything downstream assumes
the normaliser never throws.
