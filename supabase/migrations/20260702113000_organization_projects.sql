begin;

create table if not exists public.organization_projects (
  id text primary key,
  code text not null,
  name text not null,
  status text not null default 'active',
  owner text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_projects_status_chk
    check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists organization_projects_code_uidx
  on public.organization_projects (lower(code));

create index if not exists organization_projects_status_idx
  on public.organization_projects (status);

alter table public.project_code_master
  add column if not exists organization_project_id text references public.organization_projects(id) on delete set null;

alter table public.resource_master
  add column if not exists organization_project_id text references public.organization_projects(id) on delete set null;

insert into public.organization_projects (id, code, name, status, updated_at)
select distinct
  regexp_replace(lower(project), '[^a-z0-9]+', '-', 'g') as id,
  upper(regexp_replace(project, '\s+', '-', 'g')) as code,
  project as name,
  'active' as status,
  now() as updated_at
from (
  select project from public.project_code_master where nullif(btrim(project), '') is not null
  union
  select current_project as project from public.resource_master where nullif(btrim(current_project), '') is not null
  union
  select project from public.resource_requests where nullif(btrim(project), '') is not null
) p
on conflict (id) do nothing;

update public.project_code_master pcm
set organization_project_id = op.id
from public.organization_projects op
where pcm.organization_project_id is null
  and lower(pcm.project) = lower(op.name);

update public.resource_master rm
set organization_project_id = op.id
from public.organization_projects op
where rm.organization_project_id is null
  and lower(rm.current_project) = lower(op.name);

create index if not exists project_code_master_organization_project_idx
  on public.project_code_master (organization_project_id);

create index if not exists resource_master_organization_project_idx
  on public.resource_master (organization_project_id);

drop trigger if exists set_organization_projects_updated_at on public.organization_projects;
create trigger set_organization_projects_updated_at before update on public.organization_projects
  for each row execute procedure public.set_updated_at();

alter table public.organization_projects enable row level security;

drop policy if exists poc_read_organization_projects on public.organization_projects;
create policy poc_read_organization_projects on public.organization_projects
  for select to anon, authenticated using (true);

drop policy if exists poc_create_organization_projects on public.organization_projects;
create policy poc_create_organization_projects on public.organization_projects
  for insert to anon, authenticated with check (true);

drop policy if exists poc_update_organization_projects on public.organization_projects;
create policy poc_update_organization_projects on public.organization_projects
  for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.organization_projects to anon, authenticated;

commit;
