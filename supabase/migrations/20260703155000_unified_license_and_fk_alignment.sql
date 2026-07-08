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
  department text,
  project text,
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
  add column if not exists department text,
  add column if not exists project text,
  add column if not exists license_type text,
  add column if not exists purchase_date date,
  add column if not exists expiry date,
  add column if not exists billing_freq text,
  add column if not exists status_override text,
  add column if not exists memo_no text,
  add column if not exists note text,
  add column if not exists source text not null default 'manual',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.budget_pools
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.purchase_orders
  add column if not exists audit_log jsonb not null default '[]'::jsonb,
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.devices
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
  if not exists (select 1 from pg_constraint where conname = 'memos_budget_pool_fk' and conrelid = 'public.memos'::regclass) then
    alter table public.memos
      add constraint memos_budget_pool_fk
      foreign key (budget_pool_id) references public.budget_pools(id)
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
end $$;

-- Indexes for current module query paths across memo, budget, and license
-- workflows.
create index if not exists memos_budget_pool_idx
  on public.memos (budget_pool_id);

create unique index if not exists memos_memo_no_uidx
  on public.memos (memo_no);

create index if not exists licenses_source_idx
  on public.licenses (source);

create index if not exists licenses_memo_no_idx
  on public.licenses (memo_no);

-- Updated-at trigger for license table.
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
end $$;

-- PoC-compatible RLS and grants for license module table.
alter table public.licenses enable row level security;

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
end $$;

grant select, insert, update on public.licenses to anon, authenticated;

commit;
