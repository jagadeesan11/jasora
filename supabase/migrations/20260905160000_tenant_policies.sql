-- Phase 4 of multi-tenancy: the policies learn about shops.
--
-- Every policy in this database says `private.is_admin()`, which is tenant
-- blind: it answers "is this person shop staff anywhere" when the question is
-- "is this person staff HERE". That single predicate is the whole of phase 4.
--
-- Two substitutions, applied consistently:
--
--   read  -> private.is_platform_admin() or shop_id in (select private.my_shop_ids())
--   write -> private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids())
--
-- Both halves are row-independent, so the planner hoists them into an InitPlan
-- and evaluates them once per statement rather than once per row. That is why
-- phase 3 deliberately shipped set-returning helpers and no scalar
-- is_shop_admin(shop_id) — see its comments.
--
-- WHAT DELIBERATELY STAYS CROSS-SHOP
--
-- The catalogue. categories, services, addons, pricing_rules, input_templates,
-- business_hours, shop_closures and shops are all `select using (true)` today,
-- and they stay that way, because the product is one app with a shop picker: a
-- customer browsing Nexora is *supposed* to see every shop's services and
-- opening hours in order to choose one. Scoping those reads would break the
-- product to satisfy a definition of tenancy this application does not have.
--
-- What is private is what a shop knows about its own trade: bookings,
-- payments, invoices, the job history, its staff, its promo codes, its
-- customers' reviews and support requests. Those are scoped below.
--
-- profiles, customer_assets and device_tokens keep their person-scoped rules
-- untouched — they belong to people, not shops. app_settings is left alone
-- until phase 8 retires it.

-- Catalogue: reads stay public, writes become the shop's own -------------------
--
-- Creating a service or a category remains platform-admin only, which is a
-- decision already taken and unrelated to tenancy. Editing and retiring them
-- becomes the owning shop's business.

alter policy "services_admin_update" on public.services
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "services_admin_delete" on public.services
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "categories_admin_update" on public.categories
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "categories_admin_delete" on public.categories
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "addons_admin_insert" on public.addons
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "addons_admin_update" on public.addons
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "addons_admin_delete" on public.addons
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "pricing_rules_admin_insert" on public.pricing_rules
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "pricing_rules_admin_update" on public.pricing_rules
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "pricing_rules_admin_delete" on public.pricing_rules
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "input_templates_admin_insert" on public.input_templates
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "input_templates_admin_update" on public.input_templates
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "input_templates_admin_delete" on public.input_templates
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "business_hours_write_admin" on public.business_hours
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "shop_closures_write_admin" on public.shop_closures
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

-- A shop owner may edit their own shop; only the platform may create one.
alter policy "shops_admin_update" on public.shops
  using  (private.is_platform_admin() or id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or id in (select private.my_admin_shop_ids()));

-- The trade: scoped for reading as well as writing -----------------------------
--
-- The customer's own-row access is preserved in every one of these. What
-- changes is only the staff branch: "an admin, anywhere" becomes "staff here".

alter policy "bookings_select" on public.bookings
  using (
    user_id = (select auth.uid())
    or private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or technician_id = private.technician_id_for_current_user()
  );
alter policy "bookings_update" on public.bookings
  using (
    user_id = (select auth.uid())
    or private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or technician_id = private.technician_id_for_current_user()
  )
  with check (
    user_id = (select auth.uid())
    or private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or technician_id = private.technician_id_for_current_user()
  );
alter policy "bookings_insert_own" on public.bookings
  with check (user_id = (select auth.uid()) or private.is_platform_admin());
alter policy "bookings_delete_admin" on public.bookings
  using (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

-- Money. The customer keeps sight of their own; staff see their shop's.
alter policy "payments_select" on public.payments
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or exists (select 1 from public.bookings b
                where b.id = payments.booking_id and b.user_id = (select auth.uid()))
  );
alter policy "payments_insert" on public.payments
  with check (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or exists (select 1 from public.bookings b
                where b.id = payments.booking_id and b.user_id = (select auth.uid()))
  );
alter policy "payments_update" on public.payments
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or exists (select 1 from public.bookings b
                where b.id = payments.booking_id and b.user_id = (select auth.uid()))
  )
  with check (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or exists (select 1 from public.bookings b
                where b.id = payments.booking_id and b.user_id = (select auth.uid()))
  );
alter policy "payments_delete" on public.payments
  using (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "invoices_select" on public.invoices
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or exists (select 1 from public.bookings b
                where b.id = invoices.booking_id and b.user_id = (select auth.uid()))
  );

alter policy "booking_events_select" on public.booking_events
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or exists (select 1 from public.bookings b
                where b.id = booking_events.booking_id and b.user_id = (select auth.uid()))
  );

-- Staff are a shop's own business.
alter policy "technicians_select" on public.technicians
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or profile_id = (select auth.uid())
  );
alter policy "technicians_admin_insert" on public.technicians
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "technicians_admin_update" on public.technicians
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
alter policy "technicians_admin_delete" on public.technicians
  using (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

-- A promo code stays publicly visible while it is live and public — a customer
-- has to be able to read one to use it. The staff branch narrows to the shop.
alter policy "promo_codes_select_public" on public.promo_codes
  using (
    private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or (
      is_public and is_active
      and (starts_at is null or now() >= starts_at)
      and (ends_at is null or now() <= ends_at)
    )
  );
alter policy "promo_codes_write_admin" on public.promo_codes
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "promo_redemptions_select_own" on public.promo_redemptions
  using (
    profile_id = (select auth.uid())
    or private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
  );
alter policy "promo_redemptions_write_admin" on public.promo_redemptions
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

alter policy "service_feedback_select" on public.service_feedback
  using (
    user_id = (select auth.uid())
    or private.is_platform_admin()
    or shop_id in (select private.my_shop_ids())
    or technician_id = private.technician_id_for_current_user()
  );
alter policy "service_feedback_update" on public.service_feedback
  using  (user_id = (select auth.uid()) or private.is_platform_admin()
          or shop_id in (select private.my_admin_shop_ids()))
  with check (user_id = (select auth.uid()) or private.is_platform_admin()
          or shop_id in (select private.my_admin_shop_ids()));
alter policy "service_feedback_insert" on public.service_feedback
  with check (user_id = (select auth.uid()) or private.is_platform_admin());
alter policy "service_feedback_delete_admin" on public.service_feedback
  using (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

-- Anyone may still file a support request; only the shop it names may read it.
alter policy "support_requests_select_admin" on public.support_requests
  using (private.is_platform_admin() or shop_id in (select private.my_shop_ids()));
alter policy "support_requests_update_admin" on public.support_requests
  using  (private.is_platform_admin() or shop_id in (select private.my_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_shop_ids()));
alter policy "support_requests_delete_admin" on public.support_requests
  using (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));

-- Membership: staff see their own shop's roster, owners manage it.
alter policy "shop_members_read" on public.shop_members
  using (
    private.is_platform_admin()
    or profile_id = (select auth.uid())
    or shop_id in (select private.my_shop_ids())
  );
alter policy "shop_members_admin_write" on public.shop_members
  using  (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()))
  with check (private.is_platform_admin() or shop_id in (select private.my_admin_shop_ids()));
