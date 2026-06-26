begin;

create extension if not exists pgcrypto;

create table if not exists public.resource_project_codes (
  id uuid primary key default gen_random_uuid(),
  resource_request_id text not null references public.resource_requests(id) on delete cascade,
  project_code_id text references public.project_code_master(id) on delete set null,
  project text not null,
  project_code text not null,
  allocation_percent integer not null default 100,
  supervisor text,
  start_date date,
  end_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_project_codes_allocation_chk
    check (allocation_percent between 1 and 100),
  constraint resource_project_codes_dates_chk
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists resource_project_codes_resource_idx
  on public.resource_project_codes (resource_request_id);

create index if not exists resource_project_codes_project_code_idx
  on public.resource_project_codes (project_code);

create index if not exists resource_project_codes_project_idx
  on public.resource_project_codes (project);

create index if not exists resource_project_codes_dates_idx
  on public.resource_project_codes (start_date, end_date);

drop trigger if exists set_resource_project_codes_updated_at on public.resource_project_codes;
create trigger set_resource_project_codes_updated_at before update on public.resource_project_codes
  for each row execute procedure public.set_updated_at();

alter table public.resource_project_codes enable row level security;

drop policy if exists poc_read_resource_project_codes on public.resource_project_codes;
create policy poc_read_resource_project_codes on public.resource_project_codes
  for select to anon, authenticated using (true);

drop policy if exists poc_create_resource_project_codes on public.resource_project_codes;
create policy poc_create_resource_project_codes on public.resource_project_codes
  for insert to anon, authenticated with check (true);

drop policy if exists poc_update_resource_project_codes on public.resource_project_codes;
create policy poc_update_resource_project_codes on public.resource_project_codes
  for update to anon, authenticated using (true) with check (true);

drop policy if exists poc_delete_resource_project_codes on public.resource_project_codes;
create policy poc_delete_resource_project_codes on public.resource_project_codes
  for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.resource_project_codes to anon, authenticated;

commit;
