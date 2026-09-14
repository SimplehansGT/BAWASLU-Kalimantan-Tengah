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
