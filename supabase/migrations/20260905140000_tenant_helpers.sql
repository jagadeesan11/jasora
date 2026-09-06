-- Phase 3 of multi-tenancy: the helpers every policy will be written against.
--
-- Nothing uses these yet. Adding them on their own keeps phase 4 — the rewrite
-- of 81 policies — a change of predicates only, with the vocabulary already
-- settled and tested.
--
-- SHAPE MATTERS MORE THAN LOGIC HERE.
--
-- A helper that takes the row's shop_id, `is_shop_admin(shop_id)`, is called
-- once per row: 50,000 bookings means 50,000 membership lookups. A helper that
-- takes no arguments and returns a set can be hoisted by the planner into an
-- InitPlan and evaluated once for the whole statement. So policies are written
--
--     shop_id in (select private.my_shop_ids())
--
-- and never
--
--     private.is_shop_admin(shop_id)
--
-- which is why no scalar per-shop helper is defined below: offering one would
-- be offering the slow pattern. This is the same reasoning as
-- 20260823160300_rls_performance, which wrapped auth.uid() in a sub-select so
-- it was evaluated once rather than per row.
--
-- All three are SECURITY DEFINER because they read profiles and shop_members,
-- which are themselves behind RLS; and STABLE so the planner may cache them
-- within a statement.

-- Platform tier ---------------------------------------------------------------
--
-- Above shops, not inside one. A platform admin administers every shop and
-- belongs to none — which is why they were deliberately not seeded into
-- shop_members in phase 1.

create or replace function private.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

comment on function private.is_platform_admin is
  'True for role = admin: the tier above all shops. The canonical name; is_full_admin() is kept as an alias for the policies already written against it.';

-- is_full_admin() predates the shops table and is referenced by three live
-- policies (categories_admin_insert, services_admin_insert, shops_admin_insert).
-- Rather than rewrite those here, it becomes a thin alias so there is exactly
-- one definition of what a platform admin is.
create or replace function private.is_full_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.is_platform_admin();
$$;

-- Membership ------------------------------------------------------------------

create or replace function private.my_shop_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select shop_id from public.shop_members
  where profile_id = (select auth.uid());
$$;

comment on function private.my_shop_ids is
  'Shops the caller works at, any role. For read policies: shop_id in (select private.my_shop_ids()).';

-- Shops the caller runs, as opposed to works at. The write counterpart.
create or replace function private.my_admin_shop_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select shop_id from public.shop_members
  where profile_id = (select auth.uid()) and role = 'shop_owner';
$$;

comment on function private.my_admin_shop_ids is
  'Shops the caller owns. For write policies: shop_id in (select private.my_admin_shop_ids()).';

-- Both fail closed: an unauthenticated caller has no auth.uid(), so both
-- return the empty set and every policy written against them denies. That is
-- the safe direction, and it is the behaviour phase 4 depends on.
--
-- Execute is deliberately NOT revoked. A policy expression is evaluated as the
-- querying role, so revoking it from `authenticated` would make every phase-4
-- policy fail with permission denied rather than deny a row. What keeps these
-- off the public API is the schema: `private` is not exposed to PostgREST, so
-- they cannot be called over REST at all — the same protection every existing
-- private helper relies on. 20260823160200 grants usage on the schema for
-- exactly this reason.
