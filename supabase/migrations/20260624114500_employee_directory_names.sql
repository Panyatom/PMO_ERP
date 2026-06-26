begin;

alter table public.resource_requests add column if not exists resource_name_th text;
alter table public.resource_requests add column if not exists resource_name_en text;

create index if not exists resource_requests_resource_name_th_idx
  on public.resource_requests (resource_name_th);

create index if not exists resource_requests_resource_name_en_idx
  on public.resource_requests (resource_name_en);

commit;
