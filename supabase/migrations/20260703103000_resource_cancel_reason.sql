alter table public.resource_requests
  add column if not exists cancel_reason text;

create index if not exists resource_requests_cancel_reason_idx
  on public.resource_requests (cancel_reason)
  where cancel_reason is not null;
