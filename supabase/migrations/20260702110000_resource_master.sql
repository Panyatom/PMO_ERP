begin;

create table if not exists public.resource_master (
  id text primary key,
  employee_code text,
  resource_name text,
  resource_name_th text,
  resource_name_en text,
  nickname text,
  email text,
  resource_team text,
  position text,
  level text,
  employment_type text,
  source_company text,
  current_project text,
  resource_status text not null default 'active',
  onboard_date date,
  offboard_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_master_status_chk
    check (resource_status in ('active', 'inactive', 'offboarded')),
  constraint resource_master_dates_chk
    check (offboard_date is null or onboard_date is null or offboard_date >= onboard_date)
);

create unique index if not exists resource_master_employee_code_uidx
  on public.resource_master (lower(employee_code))
  where employee_code is not null and btrim(employee_code) <> '';

create index if not exists resource_master_status_idx
  on public.resource_master (resource_status);

create index if not exists resource_master_team_idx
  on public.resource_master (resource_team);

create index if not exists resource_master_name_idx
  on public.resource_master (resource_name);

alter table public.resource_requests
  add column if not exists resource_master_id text references public.resource_master(id) on delete set null;

alter table public.resource_project_codes
  add column if not exists resource_master_id text references public.resource_master(id) on delete set null;

insert into public.resource_master (
  id,
  employee_code,
  resource_name,
  resource_name_th,
  resource_name_en,
  resource_team,
  position,
  level,
  employment_type,
  current_project,
  resource_status,
  onboard_date,
  offboard_date,
  note,
  created_at,
  updated_at
)
select distinct on (coalesce(nullif(btrim(employee_code), ''), id))
  coalesce(nullif(btrim(employee_code), ''), id) as id,
  nullif(btrim(employee_code), '') as employee_code,
  coalesce(nullif(btrim(resource_name), ''), nullif(btrim(resource_name_th), ''), nullif(btrim(resource_name_en), '')) as resource_name,
  nullif(btrim(resource_name_th), '') as resource_name_th,
  nullif(btrim(resource_name_en), '') as resource_name_en,
  resource_team,
  position,
  level,
  hiring_type,
  project,
  case
    when status in ('filled', 'mitigated') then 'active'
    when status in ('resolved', 'cancelled') then 'offboarded'
    else 'inactive'
  end as resource_status,
  onboard_date,
  offboard_date,
  remark,
  created_at,
  updated_at
from public.resource_requests
where coalesce(resource_name, resource_name_th, resource_name_en, employee_code) is not null
order by coalesce(nullif(btrim(employee_code), ''), id), updated_at desc
on conflict (id) do update set
  employee_code = excluded.employee_code,
  resource_name = excluded.resource_name,
  resource_name_th = excluded.resource_name_th,
  resource_name_en = excluded.resource_name_en,
  resource_team = excluded.resource_team,
  position = excluded.position,
  level = excluded.level,
  employment_type = excluded.employment_type,
  current_project = excluded.current_project,
  resource_status = excluded.resource_status,
  onboard_date = excluded.onboard_date,
  offboard_date = excluded.offboard_date,
  note = excluded.note,
  updated_at = excluded.updated_at;

update public.resource_requests rr
set resource_master_id = rm.id
from public.resource_master rm
where rr.resource_master_id is null
  and (
    (rr.employee_code is not null and btrim(rr.employee_code) <> '' and lower(rr.employee_code) = lower(rm.employee_code))
    or (
      (rr.employee_code is null or btrim(rr.employee_code) = '')
      and rr.id = rm.id
    )
  );

create index if not exists resource_requests_resource_master_idx
  on public.resource_requests (resource_master_id);

create index if not exists resource_project_codes_resource_master_idx
  on public.resource_project_codes (resource_master_id);

drop trigger if exists set_resource_master_updated_at on public.resource_master;
create trigger set_resource_master_updated_at before update on public.resource_master
  for each row execute procedure public.set_updated_at();

alter table public.resource_master enable row level security;

drop policy if exists poc_read_resource_master on public.resource_master;
create policy poc_read_resource_master on public.resource_master
  for select to anon, authenticated using (true);

drop policy if exists poc_create_resource_master on public.resource_master;
create policy poc_create_resource_master on public.resource_master
  for insert to anon, authenticated with check (true);

drop policy if exists poc_update_resource_master on public.resource_master;
create policy poc_update_resource_master on public.resource_master
  for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.resource_master to anon, authenticated;

commit;
