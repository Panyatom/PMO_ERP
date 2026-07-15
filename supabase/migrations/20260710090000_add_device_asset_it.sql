-- PO-256 / PO-257 / PO-261 — Device Asset IT identity.
-- Additive only: Asset ACC remains in devices.asset_tag and Asset IT is stored
-- separately so import matching no longer depends on the accounting asset tag.

alter table public.devices
  add column if not exists asset_it text;
