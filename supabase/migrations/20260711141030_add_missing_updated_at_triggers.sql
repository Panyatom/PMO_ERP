do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null
     and to_regclass('public.budget_pools') is not null
     and not exists (
       select 1
       from pg_trigger
       where tgname = 'set_budget_pools_updated_at'
         and tgrelid = to_regclass('public.budget_pools')
         and not tgisinternal
     ) then
    execute 'create trigger set_budget_pools_updated_at
      before update on public.budget_pools
      for each row execute function public.set_updated_at()';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null
     and to_regclass('public.budget_manual_expenses') is not null
     and not exists (
       select 1
       from pg_trigger
       where tgname = 'set_budget_manual_expenses_updated_at'
         and tgrelid = to_regclass('public.budget_manual_expenses')
         and not tgisinternal
     ) then
    execute 'create trigger set_budget_manual_expenses_updated_at
      before update on public.budget_manual_expenses
      for each row execute function public.set_updated_at()';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null
     and to_regclass('public.devices') is not null
     and not exists (
       select 1
       from pg_trigger
       where tgname = 'set_devices_updated_at'
         and tgrelid = to_regclass('public.devices')
         and not tgisinternal
     ) then
    execute 'create trigger set_devices_updated_at
      before update on public.devices
      for each row execute function public.set_updated_at()';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null
     and to_regclass('public.licenses') is not null
     and not exists (
       select 1
       from pg_trigger
       where tgname = 'set_licenses_updated_at'
         and tgrelid = to_regclass('public.licenses')
         and not tgisinternal
     ) then
    execute 'create trigger set_licenses_updated_at
      before update on public.licenses
      for each row execute function public.set_updated_at()';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null
     and to_regclass('public.purchase_orders') is not null
     and not exists (
       select 1
       from pg_trigger
       where tgname = 'set_purchase_orders_updated_at'
         and tgrelid = to_regclass('public.purchase_orders')
         and not tgisinternal
     ) then
    execute 'create trigger set_purchase_orders_updated_at
      before update on public.purchase_orders
      for each row execute function public.set_updated_at()';
  end if;
end $$;
