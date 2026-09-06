-- Phase 2 of multi-tenancy: shop_id on every shop-owned row.
--
-- Still additive from the application's point of view. Nothing here changes an
-- RLS policy or a function, so the running shop keeps working exactly as it
-- does now; every existing row is backfilled to it before the columns are made
-- mandatory.
--
-- Three kinds of table are handled differently:
--
--   * shop-owned            -> gets shop_id
--   * child of a shop-owned -> gets shop_id too, denormalised, plus a
--                              composite foreign key so it CANNOT disagree
--                              with its parent
--   * person-owned          -> gets nothing
--
-- profiles, customer_assets and device_tokens are the person-owned ones. A
-- customer's car is theirs whichever shop they visit, and device_tokens is
-- proof by construction: `token` is globally unique because one token is one
-- device install, so a per-shop row is not even representable. Which shop may
-- notify a device is a question about that device's owner's bookings, and is
-- answered in the send path rather than by duplicating the token.

-- 1. Columns, nullable to begin with ------------------------------------------

alter table public.bookings          add column shop_id uuid references public.shops(id);
alter table public.services          add column shop_id uuid references public.shops(id);
alter table public.categories        add column shop_id uuid references public.shops(id);
alter table public.technicians       add column shop_id uuid references public.shops(id);
alter table public.promo_codes       add column shop_id uuid references public.shops(id);
alter table public.invoices          add column shop_id uuid references public.shops(id);
alter table public.business_hours    add column shop_id uuid references public.shops(id);
alter table public.shop_closures     add column shop_id uuid references public.shops(id);
alter table public.input_templates   add column shop_id uuid references public.shops(id);
alter table public.support_requests  add column shop_id uuid references public.shops(id);

alter table public.addons            add column shop_id uuid references public.shops(id);
alter table public.pricing_rules     add column shop_id uuid references public.shops(id);
alter table public.payments          add column shop_id uuid references public.shops(id);
alter table public.booking_events    add column shop_id uuid references public.shops(id);
alter table public.service_feedback  add column shop_id uuid references public.shops(id);
alter table public.promo_redemptions add column shop_id uuid references public.shops(id);

-- 2. Backfill ------------------------------------------------------------------
-- Everything that exists today belongs to the one shop.

do $$
declare
  only_shop uuid;
begin
  -- These tables carry guards that exist to stop people editing rows they
  -- should not: a customer rewriting a review after 7 days, a technician
  -- touching a booking's price, a payment changing status without an admin.
  -- None of them can tell a structural backfill from that, and the review
  -- guard refused this migration outright on the first attempt.
  --
  -- Replica mode suspends user triggers. SET LOCAL scopes it to this
  -- transaction, so it reverts on commit whatever happens — there is no state
  -- left behind for a later migration to inherit. The composite foreign keys
  -- added in step 5 validate every existing row when they are created, so the
  -- data is still checked, just by constraints rather than by triggers that
  -- were written for a different purpose.
  set local session_replication_role = replica;

  select id into strict only_shop from public.shops where slug = 'moto-ceramic';

  update public.bookings          set shop_id = only_shop where shop_id is null;
  update public.services          set shop_id = only_shop where shop_id is null;
  update public.categories        set shop_id = only_shop where shop_id is null;
  update public.technicians       set shop_id = only_shop where shop_id is null;
  update public.promo_codes       set shop_id = only_shop where shop_id is null;
  update public.invoices          set shop_id = only_shop where shop_id is null;
  update public.business_hours    set shop_id = only_shop where shop_id is null;
  update public.shop_closures     set shop_id = only_shop where shop_id is null;
  update public.input_templates   set shop_id = only_shop where shop_id is null;
  update public.support_requests  set shop_id = only_shop where shop_id is null;
  update public.addons            set shop_id = only_shop where shop_id is null;
  update public.pricing_rules     set shop_id = only_shop where shop_id is null;
  update public.payments          set shop_id = only_shop where shop_id is null;
  update public.booking_events    set shop_id = only_shop where shop_id is null;
  update public.service_feedback  set shop_id = only_shop where shop_id is null;
  update public.promo_redemptions set shop_id = only_shop where shop_id is null;
end;
$$;

-- 3. Mandatory from here on ----------------------------------------------------

alter table public.bookings          alter column shop_id set not null;
alter table public.services          alter column shop_id set not null;
alter table public.categories        alter column shop_id set not null;
alter table public.technicians       alter column shop_id set not null;
alter table public.promo_codes       alter column shop_id set not null;
alter table public.invoices          alter column shop_id set not null;
alter table public.business_hours    alter column shop_id set not null;
alter table public.shop_closures     alter column shop_id set not null;
alter table public.input_templates   alter column shop_id set not null;
alter table public.support_requests  alter column shop_id set not null;
alter table public.addons            alter column shop_id set not null;
alter table public.pricing_rules     alter column shop_id set not null;
alter table public.payments          alter column shop_id set not null;
alter table public.booking_events    alter column shop_id set not null;
alter table public.service_feedback  alter column shop_id set not null;
alter table public.promo_redemptions alter column shop_id set not null;

-- 4. Uniqueness that was global and must become per-shop ------------------------
--
-- Each of these would have made the second shop impossible to onboard, and
-- three of the four would have failed in a way that looked like a bug in the
-- shop's own data rather than a schema problem.

-- Two shops may both have a "detailing" category.
alter table public.categories drop constraint categories_slug_key;
alter table public.categories add constraint categories_shop_slug_key unique (shop_id, slug);

-- Two shops may both close on Diwali. This one is the sharpest: the second
-- shop's closure would simply have been refused.
alter table public.shop_closures drop constraint shop_closures_closed_on_key;
alter table public.shop_closures
  add constraint shop_closures_shop_date_key unique (shop_id, closed_on);

-- Opening hours were one row per weekday for the whole database.
alter table public.business_hours drop constraint business_hours_pkey;
alter table public.business_hours add primary key (shop_id, weekday);

-- Two shops may both run a code called FIRST100. Case-insensitive, as before.
drop index public.promo_codes_code_key;
create unique index promo_codes_shop_code_key
  on public.promo_codes (shop_id, upper(code));

-- invoices.number stays globally unique on purpose. Every number carries its
-- shop's prefix ("MC/2026-27/0008") and invoice_prefix is unique per shop, so
-- collisions are already impossible — and a globally unique bill number is a
-- stronger guarantee to keep than to loosen.

-- 5. Composite keys: make cross-tenant rows unrepresentable ---------------------
--
-- A trigger can be forgotten and a code path can be wrong. A composite foreign
-- key cannot: pointing (child.parent_id, child.shop_id) at (parent.id,
-- parent.shop_id) means the database itself refuses a payment whose booking
-- belongs to another shop.
--
-- These redundant unique keys exist only to be the target of those references.

alter table public.services       add constraint services_id_shop_key       unique (id, shop_id);
alter table public.categories     add constraint categories_id_shop_key     unique (id, shop_id);
alter table public.bookings       add constraint bookings_id_shop_key       unique (id, shop_id);
alter table public.promo_codes    add constraint promo_codes_id_shop_key    unique (id, shop_id);
alter table public.technicians    add constraint technicians_id_shop_key    unique (id, shop_id);
alter table public.input_templates add constraint input_templates_id_shop_key unique (id, shop_id);

-- Children must match their parent's shop.
alter table public.addons add constraint addons_shop_matches_service
  foreign key (service_id, shop_id) references public.services (id, shop_id);

alter table public.pricing_rules add constraint pricing_rules_shop_matches_service
  foreign key (service_id, shop_id) references public.services (id, shop_id);

alter table public.payments add constraint payments_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id);

alter table public.booking_events add constraint booking_events_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id);

alter table public.service_feedback add constraint service_feedback_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id);

alter table public.promo_redemptions add constraint promo_redemptions_shop_matches_code
  foreign key (promo_code_id, shop_id) references public.promo_codes (id, shop_id);

alter table public.invoices add constraint invoices_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id);

-- And the cross-entity references, which are the ones that would actually leak:
-- a booking must not be for another shop's service, technician or promo code.
-- Nullable columns are unchecked when null, which is what MATCH SIMPLE gives us
-- and what we want for an unassigned job.

alter table public.services add constraint services_shop_matches_category
  foreign key (category_id, shop_id) references public.categories (id, shop_id);

alter table public.categories add constraint categories_shop_matches_template
  foreign key (input_template_id, shop_id) references public.input_templates (id, shop_id);

alter table public.bookings add constraint bookings_shop_matches_service
  foreign key (service_id, shop_id) references public.services (id, shop_id);

alter table public.bookings add constraint bookings_shop_matches_technician
  foreign key (technician_id, shop_id) references public.technicians (id, shop_id);

alter table public.bookings add constraint bookings_shop_matches_promo
  foreign key (promo_code_id, shop_id) references public.promo_codes (id, shop_id);

-- 6. Indexes -------------------------------------------------------------------
-- Every phase-4 policy filters on shop_id, so it leads each index. The tables
-- with a composite unique or primary key above already have one.

create index bookings_shop_idx          on public.bookings(shop_id, scheduled_at);
create index invoices_shop_idx          on public.invoices(shop_id, issued_at);
create index payments_shop_idx          on public.payments(shop_id);
create index booking_events_shop_idx    on public.booking_events(shop_id);
create index service_feedback_shop_idx  on public.service_feedback(shop_id);
create index promo_redemptions_shop_idx on public.promo_redemptions(shop_id);
create index addons_shop_idx            on public.addons(shop_id);
create index pricing_rules_shop_idx     on public.pricing_rules(shop_id);
create index support_requests_shop_idx  on public.support_requests(shop_id);
create index shop_closures_shop_idx     on public.shop_closures(shop_id, closed_on);
