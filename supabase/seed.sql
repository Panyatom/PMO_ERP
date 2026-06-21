-- Seed only non-sensitive defaults. Existing rows are preserved.
insert into public.settings (id, data)
values ('app', '{"schema_version": 1}'::jsonb)
on conflict (id) do nothing;
