begin;

create table if not exists public.project_code_master (
  id text primary key,
  no text,
  project text not null,
  type text,
  project_code text not null unique,
  start_date date,
  end_date date,
  status text not null default 'Active',
  pm_owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_code_master_project_idx
  on public.project_code_master (project);

create index if not exists project_code_master_status_idx
  on public.project_code_master (status);

drop trigger if exists set_project_code_master_updated_at on public.project_code_master;
create trigger set_project_code_master_updated_at before update on public.project_code_master
  for each row execute procedure public.set_updated_at();

alter table public.project_code_master enable row level security;

drop policy if exists poc_read_project_code_master on public.project_code_master;
create policy poc_read_project_code_master on public.project_code_master for select to anon, authenticated using (true);

drop policy if exists poc_create_project_code_master on public.project_code_master;
create policy poc_create_project_code_master on public.project_code_master for insert to anon, authenticated with check (true);

drop policy if exists poc_update_project_code_master on public.project_code_master;
create policy poc_update_project_code_master on public.project_code_master for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.project_code_master to anon, authenticated;

commit;
