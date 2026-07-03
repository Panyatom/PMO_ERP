update public.organization_projects op
set code = name,
    updated_at = now()
where nullif(btrim(name), '') is not null
  and code is distinct from name
  and not exists (
    select 1
    from public.organization_projects other
    where other.id <> op.id
      and lower(other.code) = lower(op.name)
  );
