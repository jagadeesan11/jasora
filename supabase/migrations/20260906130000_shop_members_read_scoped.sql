-- shop_members was left tenant blind, and it is the table that defines tenancy.
--
-- Phase 1 created it with
--
--   using (private.is_admin() or profile_id = auth.uid())
--
-- and phase 4 never revisited it: phase 4 rewrote the policies on the sixteen
-- tables that had just been given a shop_id, and this table was not one of them
-- because it always had one. is_admin() is the pre-tenancy helper and is true
-- for role in ('admin', 'shop_owner') regardless of which shop — so any shop
-- owner could read every shop's staff list: who works there, their profile ids
-- and their roles.
--
-- It surfaced as a React duplicate-key warning rather than as a security
-- report. The admin panel asks this table "which shops am I in", got back rows
-- belonging to somebody else's shop, and rendered the same shop twice in the
-- switcher. A leak whose first symptom is a rendering bug is the argument for
-- fixing the policy rather than only deduplicating the query.
--
-- The replacement says: the platform sees everything; you always see your own
-- membership rows; and staff see the roster of shops they actually work at.
-- That last clause is what keeps the owner app's team screen working, and it
-- is scoped through my_shop_ids() rather than a role check.

alter policy "shop_members_read" on public.shop_members
  using (
    private.is_platform_admin()
    or profile_id = (select auth.uid())
    or shop_id in (select private.my_shop_ids())
  );

-- The write policy is checked below rather than assumed: it was written in the
-- same migration and against the same blind helper.
