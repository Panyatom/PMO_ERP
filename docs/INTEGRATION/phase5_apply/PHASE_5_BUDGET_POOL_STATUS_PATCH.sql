begin;

-- Add persistent Budget Pool lifecycle state so the app can stop using
-- physical DELETE and switch to UPDATE/PATCH-based inactive/archive behavior.
alter table public.budget_pools
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budget_pools_status_chk'
      and conrelid = 'public.budget_pools'::regclass
  ) then
    alter table public.budget_pools
      add constraint budget_pools_status_chk
      check (status in ('active', 'inactive', 'archived'))
      not valid;
  end if;
end $$;

create index if not exists budget_pools_status_project_name_idx
  on public.budget_pools (status, project, name);

commit;
