create table if not exists public.historical_memos (
  id text primary key,
  memo_no text not null unique,
  type text not null,
  type_label text,
  project text not null,
  subject text not null,
  reason text,
  date date,
  total numeric not null check (total > 0),
  currency text not null default 'THB',
  sections jsonb not null default '[]'::jsonb,
  sl_items jsonb not null default '[]'::jsonb,
  hw_items jsonb not null default '[]'::jsonb,
  hw_owner text,
  acct_cols jsonb not null default '[]'::jsonb,
  acct_rows jsonb not null default '[]'::jsonb,
  int_names jsonb not null default '[]'::jsonb,
  dep_items jsonb not null default '[]'::jsonb,
  int_activity text,
  int_date date,
  int_headcount numeric,
  int_pp numeric,
  ent_client text,
  ent_date date,
  ent_time text,
  ent_place text,
  ent_people numeric,
  dep_location text,
  dep_start date,
  dep_end date,
  dep_emp_count numeric,
  budget_pool_id text references public.budget_pools(id) on delete set null,
  budget_source text,
  original_document_ref text,
  audit_log jsonb not null default '[]'::jsonb,
  deleted boolean not null default false,
  deleted_at timestamp with time zone,
  deleted_by text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by text,
  updated_by text,
  constraint historical_memos_type_chk check (type in ('sl', 'hw', 'int', 'ent', 'dep')),
  constraint historical_memos_currency_chk check (currency = 'THB')
);

create index if not exists historical_memos_project_date_idx
  on public.historical_memos(project, date)
  where deleted = false;

create index if not exists historical_memos_type_idx
  on public.historical_memos(type)
  where deleted = false;

create index if not exists historical_memos_budget_pool_idx
  on public.historical_memos(budget_pool_id)
  where deleted = false;

do $$
begin
  if to_regclass('public.historical_memos') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_updated_at'
     )
     and not exists (
       select 1 from pg_trigger
       where tgname = 'set_historical_memos_updated_at'
         and tgrelid = 'public.historical_memos'::regclass
     ) then
    create trigger set_historical_memos_updated_at
      before update on public.historical_memos
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.historical_memos enable row level security;

revoke all on table public.historical_memos from anon, authenticated;
grant select, insert, update on table public.historical_memos to anon, authenticated;

create policy "historical_memos_select"
  on public.historical_memos for select
  to anon, authenticated
  using (true);

create policy "historical_memos_insert"
  on public.historical_memos for insert
  to anon, authenticated
  with check (true);

create policy "historical_memos_update"
  on public.historical_memos for update
  to anon, authenticated
  using (true)
  with check (true);
