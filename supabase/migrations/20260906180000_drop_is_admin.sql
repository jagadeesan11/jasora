-- private.is_admin() is gone.
--
-- Nothing calls it: the policies moved in 20260906130000, 20260906131000 and
-- 20260906160000, and the last ten functions moved in 20260906170000. Two
-- functions still contain the string, both only in a comment recording what
-- they used to do — checked by stripping comments before asserting, not by
-- eye.
--
-- Dropping it matters more than it looks. Postgres does not track function
-- calls inside plpgsql bodies as dependencies, so this DROP would have
-- succeeded even with live callers and broken them at runtime instead of
-- refusing. The safety here came from enumerating callers from the catalogue
-- first; the drop is just the last step.
--
-- What it leaves behind is a vocabulary with no tenant-blind option in it:
--
--   private.is_platform_admin()      above all shops
--   private.is_shop_staff(shop)      staff of one shop, for function bodies
--   private.my_shop_ids()            shops I work at, for policies
--   private.my_admin_shop_ids()      shops I run, for policies
--   private.my_customer_ids()        people who have booked with my shops
--   private.my_booked_asset_ids()    vehicles booked in at my shops
--
-- Every one of them names a scope. That is the point: the next person writing
-- a policy cannot reach for "staff, anywhere" by accident, because it no
-- longer exists.

drop function if exists private.is_admin();

-- Scaffolding from the audit that led here.
drop function if exists public.temp_isadmin_refs();
drop function if exists public.temp_isadmin_defs();

-- private.is_full_admin() is deliberately kept. It is a thin alias for
-- is_platform_admin() — not a tenant-blind predicate — and three catalogue
-- insert policies still reference it. Collapsing those onto one name is
-- tidying, not a fix, and does not belong in a security change.
