-- Measures framework — persist KPI-linked action tracking to Supabase
-- Run this in the Supabase SQL editor for project hekpzzqmqttlirrvxltn.

-- ── Measures ──────────────────────────────────────────────
create table if not exists public.measures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  source_kpi text,
  source_dashboard text,
  source_element_id text,
  owner text,
  due_date date,
  status text not null default 'open'
    check (status in ('open','in_progress','blocked','done','dismissed')),
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists measures_status_idx on public.measures (status);
create index if not exists measures_source_idx on public.measures (source_dashboard, source_element_id);
create index if not exists measures_username_idx on public.measures (username);

-- ── Measure history (status transitions, notes) ───────────
create table if not exists public.measure_history (
  id uuid primary key default gen_random_uuid(),
  measure_id uuid not null references public.measures(id) on delete cascade,
  ts timestamptz not null default now(),
  author text,
  note text,
  status_from text,
  status_to text
);

create index if not exists measure_history_measure_idx on public.measure_history (measure_id, ts desc);

-- ── KPI snapshots (track KPI drift over time) ─────────────
create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  dashboard text not null,
  element_id text,
  kpi_name text not null,
  value numeric,
  target numeric,
  comparator text,
  tolerance numeric,
  in_tolerance boolean,
  metadata jsonb default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  username text
);

create index if not exists kpi_snapshots_kpi_idx on public.kpi_snapshots (dashboard, kpi_name, captured_at desc);

-- ── Row Level Security ────────────────────────────────────
-- Matches the policy used by the existing chat_* / user_activity tables:
-- publishable/anon key can read and write. Tighten later with auth if needed.
alter table public.measures       enable row level security;
alter table public.measure_history enable row level security;
alter table public.kpi_snapshots  enable row level security;

drop policy if exists "anon all on measures"        on public.measures;
drop policy if exists "anon all on measure_history" on public.measure_history;
drop policy if exists "anon all on kpi_snapshots"   on public.kpi_snapshots;

create policy "anon all on measures"
  on public.measures for all
  using (true) with check (true);

create policy "anon all on measure_history"
  on public.measure_history for all
  using (true) with check (true);

create policy "anon all on kpi_snapshots"
  on public.kpi_snapshots for all
  using (true) with check (true);

-- ── updated_at trigger ────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists measures_touch_updated_at on public.measures;
create trigger measures_touch_updated_at
  before update on public.measures
  for each row execute function public.touch_updated_at();
