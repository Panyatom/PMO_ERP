begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.memos (
  id text primary key,
  memo_no text not null unique,
  type text,
  type_label text,
  status text not null default 'pending',
  project text,
  subject text,
  reason text,
  "to" text,
  date date,
  total numeric(16,2) not null default 0,
  amount_words text,
  requester_name text,
  requester_title text,
  reviewer_name text,
  reviewer_title text,
  reviewer_date date,
  approver_name text,
  approver_title text,
  approver_date date,
  approved_by text,
  rejected_by text,
  approval_note text,
  rejection_reason text,
  fx_rate numeric(16,6),
  sections jsonb not null default '[]'::jsonb,
  audit_log jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns already present in the live PoC but not used by every view.
alter table public.memos add column if not exists approval_chain jsonb not null default '[]'::jsonb;
alter table public.memos add column if not exists approval_evidence_url text;
alter table public.memos add column if not exists approvers jsonb not null default '[]'::jsonb;
alter table public.memos add column if not exists budget_pool_id text;
alter table public.memos add column if not exists budget_source text;
alter table public.memos add column if not exists cancellation_reason text;
alter table public.memos add column if not exists cancelled_at timestamptz;
alter table public.memos add column if not exists cancelled_by text;
alter table public.memos add column if not exists dep_emp_count integer;
alter table public.memos add column if not exists dep_end date;
alter table public.memos add column if not exists dep_location text;
alter table public.memos add column if not exists dep_start date;
alter table public.memos add column if not exists ent_client text;
alter table public.memos add column if not exists ent_date date;
alter table public.memos add column if not exists ent_people integer;
alter table public.memos add column if not exists ent_place text;
alter table public.memos add column if not exists ent_time text;
alter table public.memos add column if not exists int_activity text;
alter table public.memos add column if not exists int_date date;
alter table public.memos add column if not exists int_headcount integer;
alter table public.memos add column if not exists int_pp numeric(16,2);
alter table public.memos add column if not exists pmo_evidence_url text;
alter table public.memos add column if not exists pmo_override_by text;
alter table public.memos add column if not exists pmo_override_note text;
alter table public.memos add column if not exists sl_items jsonb not null default '[]'::jsonb;

create table if not exists public.resource_requests (
  id text primary key,
  resource_team text,
  project text,
  position text,
  level text,
  hc integer not null default 1,
  hiring_type text,
  start_date date,
  end_date date,
  request_date date,
  resolved_date date,
  remark text,
  status text not null default 'pending',
  requester_name text,
  transfer_from text,
  project_codes jsonb not null default '[]'::jsonb,
  activity_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resource_requests add column if not exists hiring_type_other text;
alter table public.resource_requests add column if not exists level_other text;
alter table public.resource_requests add column if not exists project_other text;
alter table public.resource_requests add column if not exists resource_team_other text;
alter table public.resource_requests add column if not exists project_codes jsonb not null default '[]'::jsonb;

create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists memos_status_updated_idx on public.memos (status, updated_at desc);
create index if not exists memos_project_idx on public.memos (project);
create index if not exists resource_requests_status_updated_idx on public.resource_requests (status, updated_at desc);
create index if not exists resource_requests_project_idx on public.resource_requests (project);

drop trigger if exists set_memos_updated_at on public.memos;
create trigger set_memos_updated_at before update on public.memos
for each row execute function public.set_updated_at();
drop trigger if exists set_resource_requests_updated_at on public.resource_requests;
create trigger set_resource_requests_updated_at before update on public.resource_requests
for each row execute function public.set_updated_at();
drop trigger if exists set_settings_updated_at on public.settings;
create trigger set_settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();

alter table public.memos enable row level security;
alter table public.resource_requests enable row level security;
alter table public.settings enable row level security;

-- Compatibility policies for the current no-login PoC. They intentionally omit DELETE.
-- Replace these with user/org policies as soon as Supabase Auth is introduced.
drop policy if exists poc_read_memos on public.memos;
create policy poc_read_memos on public.memos for select to anon, authenticated using (true);
drop policy if exists poc_create_memos on public.memos;
create policy poc_create_memos on public.memos for insert to anon, authenticated with check (true);
drop policy if exists poc_update_memos on public.memos;
create policy poc_update_memos on public.memos for update to anon, authenticated using (true) with check (true);

drop policy if exists poc_read_resources on public.resource_requests;
create policy poc_read_resources on public.resource_requests for select to anon, authenticated using (true);
drop policy if exists poc_create_resources on public.resource_requests;
create policy poc_create_resources on public.resource_requests for insert to anon, authenticated with check (true);
drop policy if exists poc_update_resources on public.resource_requests;
create policy poc_update_resources on public.resource_requests for update to anon, authenticated using (true) with check (true);

drop policy if exists poc_read_settings on public.settings;
create policy poc_read_settings on public.settings for select to anon, authenticated using (true);
drop policy if exists poc_create_settings on public.settings;
create policy poc_create_settings on public.settings for insert to anon, authenticated with check (true);
drop policy if exists poc_update_settings on public.settings;
create policy poc_update_settings on public.settings for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.memos to anon, authenticated;
grant select, insert, update on public.resource_requests to anon, authenticated;
grant select, insert, update on public.settings to anon, authenticated;

commit;
