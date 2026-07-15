-- Batch 2B — optional Hardware Spending <-> Device Registry linking.
-- One row per device linked to one hardware line of one historical (Manual
-- Spending) memo. hardware_line_id is an app-generated id stored alongside
-- each entry of historical_memos.hw_items (jsonb) — there is no separate
-- hardware-line table, so it cannot be a real foreign key.
create table if not exists public.historical_spending_device_links (
  id bigint generated always as identity primary key,
  historical_memo_id text not null references public.historical_memos(id) on delete restrict,
  hardware_line_id text not null,
  device_id bigint not null references public.devices(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  created_by text,
  constraint historical_spending_device_links_device_unique unique (device_id)
);

create index if not exists historical_spending_device_links_memo_idx
  on public.historical_spending_device_links(historical_memo_id);

create index if not exists historical_spending_device_links_line_idx
  on public.historical_spending_device_links(historical_memo_id, hardware_line_id);

alter table public.historical_spending_device_links enable row level security;

revoke all on table public.historical_spending_device_links from anon, authenticated;
grant select, insert, delete on table public.historical_spending_device_links to anon, authenticated;

create policy "historical_spending_device_links_select"
  on public.historical_spending_device_links for select
  to anon, authenticated
  using (true);

create policy "historical_spending_device_links_insert"
  on public.historical_spending_device_links for insert
  to anon, authenticated
  with check (true);

create policy "historical_spending_device_links_delete"
  on public.historical_spending_device_links for delete
  to anon, authenticated
  using (true);
