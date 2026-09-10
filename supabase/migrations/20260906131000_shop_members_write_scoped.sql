-- The other half of the same oversight, and the more serious half.
--
-- shop_members_admin_write was
--
--   for all using (private.is_admin()) with check (private.is_admin())
--
-- and is_admin() is true for any shop_owner anywhere. So the owner of shop A
-- could insert a row putting themselves in shop B as shop_owner — and every
-- policy phase 4 wrote is expressed as "shop_id in (select my_shop_ids())",
-- which reads this table. Membership is the thing tenancy is derived from, so
-- an unrestricted write here is not one leak, it is a way to grant yourself
-- every other one: bookings, invoices, payments, customer contact details.
--
-- Nothing had actually been written this way — the only two membership rows
-- are the ones phase 1 seeded, both for the original shop, and both correct.
-- Checked before changing the policy rather than assumed.
--
-- The replacement keeps a shop's own staffing in the hands of that shop and
-- the platform, and nobody else. WITH CHECK matters as much as USING here:
-- USING alone would refuse to update somebody else's row while still allowing
-- a brand new one to be inserted naming any shop at all.

alter policy "shop_members_admin_write" on public.shop_members
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_admin_shop_ids())
  )
  with check (
    private.is_platform_admin()
    or shop_id in (select private.my_admin_shop_ids())
  );
