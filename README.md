# Dashboard Pelaporan Pelanggaran Pemilu

Admin dashboard for receiving, storing, reviewing and analysing election
violation reports. Reports will eventually arrive from an AI chat intake bot
(WhatsApp / web); for now they arrive through a manual simulation form at
`/reports/new`.

UI copy is in Bahasa Indonesia. Code, comments and identifiers are in English.

---

## ⚠️ Before you deploy this anywhere

This system holds **allegation data about named private individuals** — reporter
names, addresses and contact details, and the names of people accused of
offences that are not proven. Treat it accordingly:

- Host it only on a **company-controlled** Supabase project and Vercel team
  account. Personal Supabase projects, personal Vercel/Netlify accounts and
  free-tier hosts are not acceptable for anything but fake data.
- Never point `scripts/seed.ts` at a database that holds real reports.
- Never commit `.env.local`. The service role key in it bypasses row level
  security completely.
- If a service role key is ever pasted somewhere it should not be, rotate it in
  the Supabase dashboard immediately — assume it is compromised.

---

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, `src/`) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Base UI) |
| Database / Auth / Storage | Supabase |
| Auth adapter | `@supabase/ssr` |
| Charts | Recharts |
| Dates | `date-fns` with the `id` locale |
| Tests | Vitest |

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Create the Supabase project and run the migration

Open the Supabase SQL editor and run
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in one
go. It creates the tables, indexes, the ticket sequence, the completeness
trigger, the RLS policies and the private `report-attachments` storage bucket.

### 3. Apply these dashboard settings by hand

The migration cannot set these — do them in the Supabase dashboard:

| Setting | Value | Why |
| --- | --- | --- |
| Authentication → Providers → **Email** | **Enabled** | It is the password backend. No mail is ever sent. |
| Authentication → Providers → Email → **Confirm email** | **OFF** | Addresses are synthetic (`user@internal.lapor`); a confirmation would never arrive. |
| Authentication → Sign In / Providers → **Allow new users to sign up** | **OFF** | Accounts are created only by an existing admin. |
| Authentication → **SMTP** | **Do not configure** | There is deliberately no email in this system. |

### 4. Fill in `.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=          # Project Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Project Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=         # Project Settings → API → service_role (server only)
INTAKE_SECRET=                     # openssl rand -base64 32
```

### 5. Create the first administrator

Accounts can only be created from inside the app by an authenticated admin,
which leaves a chicken-and-egg problem at install time. There are two ways out
of it; both produce the same result.

**With a local environment:**

```bash
npx tsx scripts/create-first-admin.ts <username>
```

It prints a generated password **once**. Copy it now — there is no email and no
self-service reset. The script refuses to run if any account already exists.

**Without one** (deploying straight to Vercel), do it in the dashboard instead:
create the user under Authentication → Users with the email
`<username>@internal.lapor` and "Auto Confirm User" ticked, then run
[`supabase/bootstrap-admin.sql`](supabase/bootstrap-admin.sql) in the SQL
editor to attach the admin profile. The file has the steps inline.

### 6. Optional: seed synthetic data

```bash
npm run seed                  # 10 spec fixtures + 40 generated reports
npm run seed -- --count=500   # the volume the dashboard is checked against
npm run seed -- --reset       # delete existing reports first
```

Every name, place and figure in the seed data is invented.

### 7. Run it

```bash
npm run dev
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build **plus** the service-role leak check |
| `npm run build:only` | Build without the leak check |
| `npm test` | Vitest suite (normaliser + ingest route) |
| `npm run lint` | ESLint |
| `npm run check:secrets` | Service-role leak check on its own |
| `npm run seed` | Seed synthetic reports |
| `npm run create-admin` | Bootstrap the first admin |

---

## How it is put together

### The normaliser is the load-bearing piece

[`src/lib/normalize.ts`](src/lib/normalize.ts) turns an arbitrary intake payload
into an insertable row. Its contract is that **nothing in it may throw**. The AI
intake is unreliable by nature, and a parser exception would mean a citizen's
report is lost — the one failure mode the whole design exists to prevent.

- Unrecognised categories become `lainnya` with a warning; the untouched input
  always survives in `category_raw`.
- Dates accept ISO, `DD/MM/YYYY`, `DD-MM-YYYY` and Indonesian relative terms
  (`kemarin`, `td malem`, `2 hari lalu`). The reporter's own words always land
  in `incident_at_text`. A future date parses but warns.
- Numbers handle `Rp 100.000,-`, `50rb`, `2jt`, `1,5jt`. A range takes its lower
  bound and warns.
- **Unknown top-level keys go to `extra` verbatim.** That column is the whole
  point: the fields the AI invents today are the columns worth adding tomorrow.

It has 53 tests, including every payload in the build spec and a fuzz pass that
asserts it never throws. They run before anything downstream is trusted.

### The database never rejects a report

Only `id`, `ticket`, `created_at`, `status` and `priority` are `NOT NULL`. There
are no `CHECK` constraints and no foreign keys on any column the AI writes to.
The only constrained fields are `status` and `priority`, which admins control.

A report containing one line of garbled text still inserts and still appears in
the list.

### Nothing is discarded — with one exception

Whatever arrives is stored verbatim in `payload` and `raw_transcript` before any
parsing. The single exception is keys matching `/nik|ktp|rekening|npwp|passport/i`,
which are stripped recursively from the row, from `extra` **and** from `payload`,
and replaced with a `parse_warnings` entry. Keeping a NIK would turn an
allegation record into an identity-theft target.

### Auth without email

Supabase Auth requires an email, so a username is mapped to a synthetic address
on an internal domain that nothing ever sends to: `budi` → `budi@internal.lapor`.
Users never see it.

- Login is username + password. A failure always says
  `Nama pengguna atau kata sandi salah.` regardless of cause — anything more
  specific turns the login form into a way to enumerate who works here.
- There is no signup page, no signup route and no server action that creates an
  account without an authenticated admin session.
- Password reset is an admin issuing a new one via `auth.admin.updateUserById`.
  Deactivating a user also revokes their refresh tokens, so the session actually
  ends rather than running until the JWT expires.

### Access control

- RLS grants **nothing** to `anon`. There is no public read path, not even by
  obscure ID.
- Every page read goes through the *user's* client, so RLS applies. The service
  role client is used in exactly two places: the ingest route (no session to act
  as) and admin user management (needs the auth admin API).
- Attachments are served through signed URLs with a **60-second** expiry,
  regenerated per request. A URL copied out of the page stops working almost
  immediately.
- Every status change, priority change, note and inline edit writes a
  `report_events` row with actor and timestamp.

### Ingest API

`POST /api/reports`, built but **wired to nothing**.

```bash
curl -X POST http://localhost:3000/api/reports \
  -H "content-type: application/json" \
  -H "x-intake-secret: $INTAKE_SECRET" \
  -d '{"narrative":"bagi bagi duit di kampung"}'
```

- Secret compared in constant time, via SHA-256 digests so length never leaks.
- **Any** body past the secret produces a stored row and a `200`, warnings and
  all. There is no `400` for bad content — a rejected report is a lost report,
  and the bot on the other end cannot ask the citizen to rephrase. A body that
  is not JSON is filed as `raw_transcript`.
- `500` only on a genuine database failure.
- Rate limited to 30 requests per minute per IP.

---

## Known limitations

Worth knowing before this goes to production:

- **Rate limiting is per-instance and in memory.** A serverless deployment runs
  several instances, each with its own counters. It blunts a runaway retry loop;
  it will not stop a determined attacker. Move it to Postgres or Upstash before
  the endpoint is wired to a real bot.
- **Search uses `ILIKE`, not the full-text index.** The migration's GIN index
  covers an expression PostgREST cannot target directly. At one province's
  volume this is comfortably fast, but it is the first thing to revisit if the
  table grows large.
- **Dashboard aggregation happens in JS** over up to 10,000 filtered rows, not
  in SQL. This keeps every number defined in one readable place instead of
  across a dozen RPCs. If the cap is ever hit the page says so; the honest fix
  at that point is materialised views, not a bigger cap.
- **`npm audit` reports a moderate advisory against the `postcss` bundled inside
  Next 15.** The only fix offered is Next 16, which the build spec pins against.
  It affects build-time CSS parsing of attacker-controlled stylesheets, which
  this project does not do. Revisit when the Next version is reconsidered.

---

## Verifying the build

The definition of done, and how to check each item:

| # | Requirement | How to verify |
| --- | --- | --- |
| 1 | Build passes with zero TypeScript errors | `npm run build` |
| 2 | `/` while logged out redirects to `/login` | Open `/` in a private window |
| 3 | No account creation without an admin session | `grep -r "signUp" src/` returns nothing; `createUserAction` checks `role === 'admin'` |
| 4 | All ten payloads POST and return 200 | `npm test` — covered in `src/app/api/reports/route.test.ts` |
| 5 | Payload 5 inserts and its detail page renders | `npm test`, then open the seeded report |
| 6 | Payload 6 stores no NIK or account number | `npm test` — asserted against row, `extra` and `payload` |
| 7 | Form with only a narrative succeeds | Submit `/reports/new` with just the narrative |
| 8 | Dashboard renders with zero reports | `npm run seed -- --reset --count=0`, open `/` |
| 9 | Dashboard renders with 500 reports | `npm run seed -- --reset --count=500`, open `/` |
| 10 | Service role key in no client bundle | `npm run build` runs the check and fails if it leaks |
| 11 | Anonymous REST read returns no rows | See below |
| 12 | Status changes appear in the audit log | Change a status, check the detail page |

Checking #11 by hand:

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/reports?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# expected: []
```

---

## Project layout

```
src/
  app/
    (auth)/login/        the only public page
    (app)/               everything behind the auth guard
      page.tsx           dashboard
      reports/           list, detail, intake form
      admin/users/       account management
    api/reports/         ingest endpoint (POST only)
    api/export/          CSV export of the filtered set
  components/
    ui/                  shadcn
    dashboard/           stat cards, charts, analysis panels
    reports/             table, filters, form, detail panels
    admin/               user management
  lib/
    normalize.ts         the load-bearing parser (+ .test.ts)
    queries.ts           every read, all through RLS
    actions.ts           every mutation, each writing an audit row
    supabase/            client / server / admin / middleware
    constants.ts         buckets, statuses, synonym map, labels
  types/database.ts      mirrors `supabase gen types typescript`
scripts/
  create-first-admin.ts  bootstrap, refuses once accounts exist
  seed.ts                synthetic data only
  check-client-bundle.ts service-role leak check, runs on build
supabase/migrations/0001_init.sql
```

### Regenerating database types

`src/types/database.ts` is hand-written to match the migration. Once a project
exists, regenerate it against the real schema:

```bash
npx supabase gen types typescript --project-id <id> --schema public > src/types/database.ts
```
