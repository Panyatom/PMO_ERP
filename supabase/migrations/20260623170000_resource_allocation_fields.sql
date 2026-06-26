begin;

alter table public.resource_requests add column if not exists resource_name text;
alter table public.resource_requests add column if not exists employee_code text;
alter table public.resource_requests add column if not exists primary_project_code text;
alter table public.resource_requests add column if not exists allocation_percent integer;
alter table public.resource_requests add column if not exists onboard_date date;
alter table public.resource_requests add column if not exists offboard_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'resource_requests_allocation_percent_chk'
      and conrelid = 'public.resource_requests'::regclass
  ) then
    alter table public.resource_requests
      add constraint resource_requests_allocation_percent_chk
      check (allocation_percent is null or allocation_percent between 1 and 100)
      not valid;
  end if;
end $$;

create index if not exists resource_requests_resource_name_idx
  on public.resource_requests (resource_name);

create index if not exists resource_requests_employee_code_idx
  on public.resource_requests (employee_code);

create index if not exists resource_requests_onboard_date_idx
  on public.resource_requests (onboard_date);

commit;
