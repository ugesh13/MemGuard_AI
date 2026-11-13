-- MemGuard AI: metadata-only schema for Supabase.
-- No table has a column that can hold record text, prompts, model output, canary values or keys.
-- Row Level Security: every user can read and delete only their own rows.

create extension if not exists pgcrypto;

-- ---------- profiles (role per auth user) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'auditor' check (role in ('admin', 'auditor', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;

-- ---------- audit_runs (scores and counts only) ----------
create table if not exists public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model_label text not null check (char_length(model_label) between 1 and 120),
  source text not null check (source in ('demo_lab', 'engine_import')),
  records_count integer not null check (records_count >= 0),
  canaries_count integer not null default 0 check (canaries_count >= 0),
  holdout_count integer not null default 0 check (holdout_count >= 0),
  risk_score smallint not null check (risk_score between 0 and 100),
  risk_band text not null check (risk_band in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  ci_low smallint check (ci_low between 0 and 100),
  ci_high smallint check (ci_high between 0 and 100),
  tpr real check (tpr between 0 and 1),
  fpr real check (fpr between 0 and 1),
  auc real check (auc between 0 and 1),
  duration_ms integer check (duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index if not exists audit_runs_user_created_idx on public.audit_runs (user_id, created_at desc);

-- ---------- receipts ----------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  audit_run_id uuid references public.audit_runs(id) on delete set null,
  receipt_uid uuid,
  report_sha256 text not null check (report_sha256 ~ '^[0-9a-f]{64}$'),
  signature text check (signature ~ '^[0-9a-f]{64}$'),
  bytes_persisted integer not null default 0 check (bytes_persisted = 0),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists receipts_user_issued_idx on public.receipts (user_id, issued_at desc);
create index if not exists receipts_run_idx on public.receipts (audit_run_id);

-- ---------- garak_imports (aggregated counts only) ----------
create table if not exists public.garak_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garak_version text check (char_length(garak_version) <= 40),
  probes_total integer not null check (probes_total >= 0),
  probes_with_hits integer not null check (probes_with_hits >= 0),
  summary jsonb not null default '[]'::jsonb check (jsonb_typeof(summary) = 'array' and pg_column_size(summary) < 65536),
  created_at timestamptz not null default now()
);
create index if not exists garak_imports_user_created_idx on public.garak_imports (user_id, created_at desc);

-- Only probe/detector/passed/total keys are allowed inside summary items.
create or replace function public.garak_summary_is_clean(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_array_elements(s) e, jsonb_object_keys(e) k
    where k not in ('probe', 'detector', 'passed', 'total')
  );
$$;
alter table public.garak_imports drop constraint if exists garak_summary_allow_list;
alter table public.garak_imports add constraint garak_summary_allow_list check (public.garak_summary_is_clean(summary));

-- ---------- audit_log (actions only) ----------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null check (action in ('audit_complete', 'report_download', 'session_wipe', 'garak_import')),
  created_at timestamptz not null default now()
);
create index if not exists audit_log_user_created_idx on public.audit_log (user_id, created_at desc);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.audit_runs enable row level security;
alter table public.receipts enable row level security;
alter table public.garak_imports enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
-- No insert/update policy: roles can only be changed by an admin in the dashboard / SQL editor.

drop policy if exists "runs: read own" on public.audit_runs;
create policy "runs: read own" on public.audit_runs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "runs: insert own" on public.audit_runs;
create policy "runs: insert own" on public.audit_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin', 'auditor')));
drop policy if exists "runs: delete own" on public.audit_runs;
create policy "runs: delete own" on public.audit_runs for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "receipts: read own" on public.receipts;
create policy "receipts: read own" on public.receipts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "receipts: insert own" on public.receipts;
create policy "receipts: insert own" on public.receipts for insert to authenticated
  with check (user_id = (select auth.uid()) and (audit_run_id is null or exists (select 1 from public.audit_runs r where r.id = audit_run_id and r.user_id = (select auth.uid()))));
drop policy if exists "receipts: delete own" on public.receipts;
create policy "receipts: delete own" on public.receipts for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "garak: read own" on public.garak_imports;
create policy "garak: read own" on public.garak_imports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "garak: insert own" on public.garak_imports;
create policy "garak: insert own" on public.garak_imports for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "garak: delete own" on public.garak_imports;
create policy "garak: delete own" on public.garak_imports for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "log: read own" on public.audit_log;
create policy "log: read own" on public.audit_log for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "log: insert own" on public.audit_log;
create policy "log: insert own" on public.audit_log for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Anonymous visitors get nothing.
revoke all on public.profiles, public.audit_runs, public.receipts, public.garak_imports, public.audit_log from anon;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.audit_runs, public.receipts, public.garak_imports to authenticated;
grant select, insert on public.audit_log to authenticated;
