-- The three customer-owned tables stop being readable by every shop.
--
-- WHAT WAS WRONG
--
-- profiles, customer_assets and device_tokens all resolved staff access
-- through private.is_admin(), which is `role in ('admin','shop_owner')` and
-- says nothing about which shop. So the owner of any shop could read, edit and
-- delete every customer record in the system: names, phone numbers, email
-- addresses, home addresses, vehicles and push tokens belonging to other
-- shops' customers.
--
-- Phase 4 rewrote the policies on the sixteen tables that gained a shop_id and
-- did not touch these three, because these three deliberately have no shop_id:
-- a person and their car belong to a customer, not to a shop. That absence is
-- correct, and it is exactly why they were skipped. The scope has to be
-- derived instead — from the bookings that connect a customer to a shop.
--
-- AND ONE PRIVILEGE ESCALATION
--
-- profiles_update_own_or_admin let a shop owner update any profile row, and
-- prevent_self_role_escalation permitted a role change to anyone passing
-- is_admin() — which a shop owner does. Together those meant a shop owner
-- could set their own profile's role to 'admin' and become a platform admin
-- over every shop. The trigger is fixed in the next migration; the policy half
-- is fixed here.
--
-- WHAT STAFF ACTUALLY NEED
--
-- Read-only, and only for people they are serving: the bookings list shows a
-- customer's name, phone and address, and the job sheet shows the vehicle.
-- Nothing in either app writes another person's profile — the one profile
-- write in the admin panel goes through the service key — so writes become
-- own-row-only, with the platform tier above.

-- Helpers ---------------------------------------------------------------------
--
-- Set-returning and argument-free, so the planner hoists them into an InitPlan
-- and evaluates them once per statement rather than once per row. Same reason
-- as my_shop_ids() in 20260905140000, and the same reason no scalar per-row
-- variant is offered here.

create or replace function private.my_customer_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct b.user_id
    from public.bookings b
   where b.shop_id in (select private.my_shop_ids());
$$;

comment on function private.my_customer_ids is
  'Profiles of people who have booked with a shop the caller works at. The link between a customer and a shop is a booking; there is no other.';

create or replace function private.my_booked_asset_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct b.asset_id
    from public.bookings b
   where b.asset_id is not null
     and b.shop_id in (select private.my_shop_ids());
$$;

comment on function private.my_booked_asset_ids is
  'Vehicles actually booked in at a shop the caller works at — not every vehicle those customers own.';

-- profiles --------------------------------------------------------------------

alter policy "profiles_select_own_or_admin" on public.profiles
  using (
    id = (select auth.uid())
    or private.is_platform_admin()
    or id in (select private.my_customer_ids())
  );

-- Own row only. A shop owner could previously edit any customer's name, phone
-- and address; nothing ever needed that, and combined with the role trigger it
-- was how a shop owner could promote themselves.
alter policy "profiles_update_own_or_admin" on public.profiles
  using (id = (select auth.uid()) or private.is_platform_admin())
  with check (id = (select auth.uid()) or private.is_platform_admin());

alter policy "profiles_insert_own" on public.profiles
  with check (
    (id = (select auth.uid()) and role = 'customer')
    or private.is_platform_admin()
  );

-- Deleting a profile cascades to their bookings, so one shop's owner could
-- have destroyed another shop's history. Platform only.
alter policy "profiles_delete_admin" on public.profiles
  using (private.is_platform_admin());

-- customer_assets -------------------------------------------------------------
--
-- The single FOR ALL policy is replaced by a read and a write, because the two
-- answers now differ: staff may see a vehicle that has been booked in with
-- them, and may not change it.

drop policy "customer_assets_owner" on public.customer_assets;

create policy "customer_assets_select" on public.customer_assets
  for select using (
    user_id = (select auth.uid())
    or private.is_platform_admin()
    -- The vehicle on a job sheet, not the customer's whole garage.
    or id in (select private.my_booked_asset_ids())
  );

create policy "customer_assets_write" on public.customer_assets
  for all
  using (user_id = (select auth.uid()) or private.is_platform_admin())
  with check (user_id = (select auth.uid()) or private.is_platform_admin());

-- device_tokens ---------------------------------------------------------------
--
-- Nobody needs staff access here at all: send-booking-notification reads this
-- table with the service role key, which bypasses RLS entirely. So the policy
-- can say the simplest true thing — your own device is yours — and the
-- cross-shop exposure disappears rather than being narrowed.

alter policy "device_tokens_owner" on public.device_tokens
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
