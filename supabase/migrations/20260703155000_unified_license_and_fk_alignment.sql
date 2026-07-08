begin;

-- Unified schema Phase 2: License baselines and shared FK alignment.
-- This migration completes schema-only alignment. It intentionally performs no
-- data backfills, deletes, renames, or type changes.

-- Manual/other license inventory. Memo-derived licenses remain derived from
-- completed SL memos and memos.sl_items until a later approved phase.
create table if not exists public.licenses (
  id text primary key,
  name text,
  plan text,
  vendor text,
  seats integer not null default 1,
  price_per_month numeric(16,2) not null default 0,
  owner text,
  owner_profile_id bigint references public.user_profiles(id) on delete set null,
  department text,
  project text,
  organization_project_id text references public.organization_projects(id) on delete set null,
  license_type text,
  purchase_date date,
  expiry date,
  billing_freq text,
  status_override text,
  memo_no text references public.memos(memo_no) on delete set null,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint licenses_seats_positive_chk check (seats > 0),
  constraint licenses_price_per_month_nonnegative_chk check (price_per_month >= 0)
);

alter table public.licenses
  add column if not exists name text,
  add column if not exists plan text,
  add column if not exists vendor text,
  add column if not exists seats integer not null default 1,
  add column if not exists price_per_month numeric(16,2) not null default 0,
  add column if not exists owner text,
  add column if not exists owner_profile_id bigint,
  add column if not exists department text,
  add column if not exists project text,
  add column if not exists organization_project_id text,
  add column if not exists license_type text,
  add column if not exists purchase_date date,
  add column if not exists expiry date,
  add column if not exists billing_freq text,
  add column if not exists status_override text,
  add column if not exists memo_no text,
  add column if not exists note text,
  add column if not exists source text not null default 'manual',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by text,
  add column if not exists updated_by text;

-- Normalized license assignment, import, review, and override state. Existing
-- settings JSON rows remain compatibility storage until app/data migration.
create table if not exists public.license_user_assignments (
  id text primary key,
  license_id text references public.licenses(id) on delete set null,
  license_name text,
  license_plan text,
  user_profile_id bigint references public.user_profiles(id) on delete set null,
  email text,
  project text,
  organization_project_id text references public.organization_projects(id) on delete set null,
  source text not null default 'manual',
  source_memo_no text references public.memos(memo_no) on delete set null,
  active boolean not null default true,
  review_status text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  audit_log jsonb not null default '[]'::jsonb
);

alter table public.license_user_assignments
  add column if not exists license_id text,
  add column if not exists license_name text,
  add column if not exists license_plan text,
  add column if not exists user_profile_id bigint,
  add column if not exists email text,
  add column if not exists project text,
  add column if not exists organization_project_id text,
  add column if not exists source text not null default 'manual',
  add column if not exists source_memo_no text,
  add column if not exists active boolean not null default true,
  add column if not exists review_status text,
  add column if not exists imported_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by text,
  add column if not exists updated_by text,
  add column if not exists audit_log jsonb not null default '[]'::jsonb;

-- Shared-master reference columns added to existing canonical PMO_ERP tables
-- while preserving legacy compatibility fields such as project and owner.
alter table public.memos
  add column if not exists organization_project_id text;

alter table public.budget_manual_expenses
  add column if not exists organization_project_id text;

alter table public.resource_requests
  add column if not exists organization_project_id text;

alter table public.budget_pools
  add column if not exists organization_project_id text,
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.infra_costs
  add column if not exists organization_project_id text,
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.purchase_orders
  add column if not exists organization_project_id text,
  add column if not exists audit_log jsonb not null default '[]'::jsonb,
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.devices
  add column if not exists owner_profile_id bigint,
  add column if not exists organization_project_id text,
  add column if not exists purchase_order_id text,
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists audit_log jsonb not null default '[]'::jsonb,
  add column if not exists created_by text,
  add column if not exists updated_by text;

-- Foreign keys and check constraints are NOT VALID where they may touch
-- pre-existing data, allowing human review before validation/backfill.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memos_organization_project_fk' and conrelid = 'public.memos'::regclass) then
    alter table public.memos
      add constraint memos_organization_project_fk
      foreign key (organization_project_id) references public.organization_projects(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'memos_budget_pool_fk' and conrelid = 'public.memos'::regclass) then
    alter table public.memos
      add constraint memos_budget_pool_fk
      foreign key (budget_pool_id) references public.budget_pools(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budget_manual_expenses_organization_project_fk' and conrelid = 'public.budget_manual_expenses'::regclass) then
    alter table public.budget_manual_expenses
      add constraint budget_manual_expenses_organization_project_fk
      foreign key (organization_project_id) references public.organization_projects(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'resource_requests_organization_project_fk' and conrelid = 'public.resource_requests'::regclass) then
    alter table public.resource_requests
      add constraint resource_requests_organization_project_fk
      foreign key (organization_project_id) references public.organization_projects(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'licenses_owner_profile_fk' and conrelid = 'public.licenses'::regclass) then
    alter table public.licenses
      add constraint licenses_owner_profile_fk
      foreign key (owner_profile_id) references public.user_profiles(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'licenses_organization_project_fk' and conrelid = 'public.licenses'::regclass) then
    alter table public.licenses
      add constraint licenses_organization_project_fk
      foreign key (organization_project_id) references public.organization_projects(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'licenses_memo_no_fk' and conrelid = 'public.licenses'::regclass) then
    alter table public.licenses
      add constraint licenses_memo_no_fk
      foreign key (memo_no) references public.memos(memo_no)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'licenses_seats_positive_chk' and conrelid = 'public.licenses'::regclass) then
    alter table public.licenses
      add constraint licenses_seats_positive_chk check (seats > 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'licenses_price_per_month_nonnegative_chk' and conrelid = 'public.licenses'::regclass) then
    alter table public.licenses
      add constraint licenses_price_per_month_nonnegative_chk check (price_per_month >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'license_user_assignments_license_fk' and conrelid = 'public.license_user_assignments'::regclass) then
    alter table public.license_user_assignments
      add constraint license_user_assignments_license_fk
      foreign key (license_id) references public.licenses(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'license_user_assignments_user_profile_fk' and conrelid = 'public.license_user_assignments'::regclass) then
    alter table public.license_user_assignments
      add constraint license_user_assignments_user_profile_fk
      foreign key (user_profile_id) references public.user_profiles(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'license_user_assignments_organization_project_fk' and conrelid = 'public.license_user_assignments'::regclass) then
    alter table public.license_user_assignments
      add constraint license_user_assignments_organization_project_fk
      foreign key (organization_project_id) references public.organization_projects(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'license_user_assignments_source_memo_no_fk' and conrelid = 'public.license_user_assignments'::regclass) then
    alter table public.license_user_assignments
      add constraint license_user_assignments_source_memo_no_fk
      foreign key (source_memo_no) references public.memos(memo_no)
      on delete set null not valid;
  end if;
end $$;

-- Indexes for FK columns, status filters, project filters, and current module
-- query paths across memo, budget, license, device, and resource workflows.
create index if not exists memos_organization_project_idx
  on public.memos (organization_project_id);

create index if not exists memos_budget_pool_idx
  on public.memos (budget_pool_id);

create unique index if not exists memos_memo_no_uidx
  on public.memos (memo_no);

create index if not exists budget_manual_expenses_organization_project_idx
  on public.budget_manual_expenses (organization_project_id);

create index if not exists resource_requests_organization_project_idx
  on public.resource_requests (organization_project_id);

create index if not exists licenses_source_idx
  on public.licenses (source);

create index if not exists licenses_organization_project_idx
  on public.licenses (organization_project_id);

create index if not exists licenses_owner_profile_idx
  on public.licenses (owner_profile_id);

create index if not exists licenses_memo_no_idx
  on public.licenses (memo_no);

create index if not exists licenses_expiry_idx
  on public.licenses (expiry);

create index if not exists licenses_status_override_idx
  on public.licenses (status_override);

create index if not exists licenses_name_lower_idx
  on public.licenses (lower(name))
  where name is not null and btrim(name) <> '';

create index if not exists license_user_assignments_user_profile_idx
  on public.license_user_assignments (user_profile_id);

create index if not exists license_user_assignments_email_lower_idx
  on public.license_user_assignments (lower(email))
  where email is not null and btrim(email) <> '';

create index if not exists license_user_assignments_license_idx
  on public.license_user_assignments (license_id);

create index if not exists license_user_assignments_organization_project_idx
  on public.license_user_assignments (organization_project_id);

create index if not exists license_user_assignments_source_memo_no_idx
  on public.license_user_assignments (source_memo_no);

create index if not exists license_user_assignments_active_idx
  on public.license_user_assignments (active);

create index if not exists license_user_assignments_review_status_idx
  on public.license_user_assignments (review_status);

-- Updated-at triggers for license tables.
do $$
begin
  if to_regproc('public.set_updated_at()') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'set_licenses_updated_at'
         and tgrelid = 'public.licenses'::regclass
     ) then
    create trigger set_licenses_updated_at
      before update on public.licenses
      for each row execute procedure public.set_updated_at();
  end if;

  if to_regproc('public.set_updated_at()') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'set_license_user_assignments_updated_at'
         and tgrelid = 'public.license_user_assignments'::regclass
     ) then
    create trigger set_license_user_assignments_updated_at
      before update on public.license_user_assignments
      for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- PoC-compatible RLS and grants for license module tables.
alter table public.licenses enable row level security;
alter table public.license_user_assignments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'licenses' and policyname = 'poc_read_licenses') then
    create policy poc_read_licenses on public.licenses for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'licenses' and policyname = 'poc_create_licenses') then
    create policy poc_create_licenses on public.licenses for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'licenses' and policyname = 'poc_update_licenses') then
    create policy poc_update_licenses on public.licenses for update to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'license_user_assignments' and policyname = 'poc_read_license_user_assignments') then
    create policy poc_read_license_user_assignments on public.license_user_assignments for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'license_user_assignments' and policyname = 'poc_create_license_user_assignments') then
    create policy poc_create_license_user_assignments on public.license_user_assignments for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'license_user_assignments' and policyname = 'poc_update_license_user_assignments') then
    create policy poc_update_license_user_assignments on public.license_user_assignments for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update on public.licenses to anon, authenticated;
grant select, insert, update on public.license_user_assignments to anon, authenticated;

commit;
