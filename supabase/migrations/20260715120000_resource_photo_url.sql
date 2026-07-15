begin;

alter table public.resource_requests
  add column if not exists photo_url text;

alter table public.resource_master
  add column if not exists photo_url text;

commit;
