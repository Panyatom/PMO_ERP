begin;

-- Unified schema Phase 2: Budget vs Actual baselines.
-- These tables support canonical budget pools and infrastructure actual-spend
-- lines while retaining legacy project text for backward compatibility.

-- Canonical budget target table managed from settings and consumed by BvA,
-- memo tagging, and manual actual-spend workflows.
create table if not exists public.budget_pools (
  id text primary key,
  project text,
  name text not null,
  budget numeric(16,2) not null default 0,
  year integer,
  start_month text,
  end_month text,
  memo_types jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint budget_pools_budget_nonnegative_chk check (budget >= 0),
  constraint budget_pools_month_range_chk check (
    (start_month is null and end_month is null)
    or
    (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and start_month <= end_month)
  )
);

alter table public.budget_pools
  add column if not exists project text,
  add column if not exists name text,
  add column if not exists budget numeric(16,2) not null default 0,
  add column if not exists year integer,
  add column if not exists start_month text,
  add column if not exists end_month text,
  add column if not exists memo_types jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by text,
  add column if not exists updated_by text;

-- Monthly infrastructure costs used by Budget vs Actual calculations.
create table if not exists public.infra_costs (
  id text primary key,
  project text,
  program text,
  monthly_cost numeric(16,2) not null default 0,
  start_month text,
  end_month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infra_costs_monthly_cost_nonnegative_chk check (monthly_cost >= 0),
  constraint infra_costs_month_range_chk check (
    start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    and end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    and start_month <= end_month
  )
);

alter table public.infra_costs
  add column if not exists project text,
  add column if not exists program text,
  add column if not exists monthly_cost numeric(16,2) not null default 0,
  add column if not exists start_month text,
  add column if not exists end_month text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Constraints are added with existence checks so an already-created partial
-- table can be brought up to the unified contract without data rewrites.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'budget_pools_budget_nonnegative_chk' and conrelid = 'public.budget_pools'::regclass) then
    alter table public.budget_pools
      add constraint budget_pools_budget_nonnegative_chk check (budget >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budget_pools_month_range_chk' and conrelid = 'public.budget_pools'::regclass) then
    alter table public.budget_pools
      add constraint budget_pools_month_range_chk check (
        (start_month is null and end_month is null)
        or
        (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          and end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          and start_month <= end_month)
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'infra_costs_monthly_cost_nonnegative_chk' and conrelid = 'public.infra_costs'::regclass) then
    alter table public.infra_costs
      add constraint infra_costs_monthly_cost_nonnegative_chk check (monthly_cost >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'infra_costs_month_range_chk' and conrelid = 'public.infra_costs'::regclass) then
    alter table public.infra_costs
      add constraint infra_costs_month_range_chk check (
        start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        and end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        and start_month <= end_month
      ) not valid;
  end if;
end $$;

-- Budget indexes support current app query paths for project filters and
-- pool lookups.
create index if not exists budget_pools_project_idx
  on public.budget_pools (project);

create index if not exists budget_pools_project_name_idx
  on public.budget_pools (project, name);

create index if not exists infra_costs_project_idx
  on public.infra_costs (project);

-- Updated-at triggers for budget tables.
do $$
begin
  if to_regproc('public.set_updated_at()') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'set_budget_pools_updated_at'
         and tgrelid = 'public.budget_pools'::regclass
     ) then
    create trigger set_budget_pools_updated_at
      before update on public.budget_pools
      for each row execute procedure public.set_updated_at();
  end if;

  if to_regproc('public.set_updated_at()') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'set_infra_costs_updated_at'
         and tgrelid = 'public.infra_costs'::regclass
     ) then
    create trigger set_infra_costs_updated_at
      before update on public.infra_costs
      for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- PoC-compatible RLS and grants for budget baseline tables.
alter table public.budget_pools enable row level security;
alter table public.infra_costs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budget_pools' and policyname = 'poc_read_budget_pools') then
    create policy poc_read_budget_pools on public.budget_pools for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budget_pools' and policyname = 'poc_create_budget_pools') then
    create policy poc_create_budget_pools on public.budget_pools for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budget_pools' and policyname = 'poc_update_budget_pools') then
    create policy poc_update_budget_pools on public.budget_pools for update to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'infra_costs' and policyname = 'poc_read_infra_costs') then
    create policy poc_read_infra_costs on public.infra_costs for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'infra_costs' and policyname = 'poc_create_infra_costs') then
    create policy poc_create_infra_costs on public.infra_costs for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'infra_costs' and policyname = 'poc_update_infra_costs') then
    create policy poc_update_infra_costs on public.infra_costs for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update on public.budget_pools to anon, authenticated;
grant select, insert, update on public.infra_costs to anon, authenticated;

commit;
