-- Phase 2 broke every embedded read in both apps. This puts them back.
--
-- WHAT HAPPENED
--
-- Phase 2 added a composite foreign key beside each existing single-column one
-- so a child row cannot belong to a different shop from its parent. It never
-- dropped the original, so twelve table pairs ended up with two foreign keys
-- pointing the same way. PostgREST resolves an embed by finding the
-- relationship between two tables; with two, it refuses:
--
--   Could not embed because more than one relationship was found for
--   'categories' and 'input_templates'
--
-- Every one of these was failing against the live database:
--
--   categories->input_templates   services->categories    bookings->services
--   bookings->technicians         bookings->promo_codes   bookings->invoices
--   bookings->payments            addons->services        pricing_rules->services
--   service_feedback->bookings    invoices->bookings      promo_redemptions->promo_codes
--
-- which is the admin bookings list, the customer's booking history, the owner
-- inbox, invoices and feedback. The leak suite never noticed because it asserts
-- on rows and policies and does not embed anything — a reminder that a test
-- suite only covers the shapes of query it actually makes.
--
-- WHY THE SINGLE-COLUMN KEY GOES, RATHER THAN ADDING HINTS
--
-- PostgREST can be told which relationship to use — services!fk_name(...) — but
-- that means editing every embed in both apps, remembering it forever, and it
-- would not help the mobile builds already installed, which send the plain
-- form and would stay broken until every phone updated. Removing the ambiguity
-- at the database fixes those installs without touching them.
--
-- Nothing is lost by dropping it. With unique (id, shop_id) on the parent, a
-- composite key on (parent_id, shop_id) already guarantees the parent row
-- exists — it is strictly the stronger constraint, and it is the one that also
-- guarantees the shop matches.
--
-- WHAT HAD TO BE CARRIED ACROSS
--
-- The delete behaviour. The composite keys were added with no ON DELETE
-- clause, so they default to NO ACTION, while the originals variously cascade,
-- restrict, or null the column. Dropping the originals as they stand would
-- have silently changed what happens when a service, booking or promo code is
-- deleted — cascades would become errors. So each composite is recreated below
-- carrying the action its original had, read from the live catalogue rather
-- than from the migration that created it.
--
-- The three SET NULL cases use the column-list form, new in Postgres 15. A
-- bare ON DELETE SET NULL on a composite key nulls every column in it,
-- including shop_id, which is NOT NULL — so deleting a technician would have
-- raised a not-null violation instead of unassigning the booking.

-- services -> categories: cascade ---------------------------------------------

alter table public.services drop constraint if exists services_category_id_fkey;
alter table public.services drop constraint if exists services_shop_matches_category;
alter table public.services add constraint services_shop_matches_category
  foreign key (category_id, shop_id) references public.categories (id, shop_id)
  on delete cascade;

-- categories -> input_templates: null the template, keep the shop -------------

alter table public.categories drop constraint if exists categories_input_template_id_fkey;
alter table public.categories drop constraint if exists categories_shop_matches_template;
alter table public.categories add constraint categories_shop_matches_template
  foreign key (input_template_id, shop_id) references public.input_templates (id, shop_id)
  on delete set null (input_template_id);

-- addons, pricing_rules -> services: cascade ----------------------------------

alter table public.addons drop constraint if exists addons_service_id_fkey;
alter table public.addons drop constraint if exists addons_shop_matches_service;
alter table public.addons add constraint addons_shop_matches_service
  foreign key (service_id, shop_id) references public.services (id, shop_id)
  on delete cascade;

alter table public.pricing_rules drop constraint if exists pricing_rules_service_id_fkey;
alter table public.pricing_rules drop constraint if exists pricing_rules_shop_matches_service;
alter table public.pricing_rules add constraint pricing_rules_shop_matches_service
  foreign key (service_id, shop_id) references public.services (id, shop_id)
  on delete cascade;

-- bookings -> services: restrict ----------------------------------------------
--
-- A service with bookings against it cannot be deleted, only deactivated. That
-- is deliberate: the booking history has to keep naming what was bought.

alter table public.bookings drop constraint if exists bookings_service_id_fkey;
alter table public.bookings drop constraint if exists bookings_shop_matches_service;
alter table public.bookings add constraint bookings_shop_matches_service
  foreign key (service_id, shop_id) references public.services (id, shop_id)
  on delete restrict;

-- bookings -> technicians, promo_codes: null the reference, keep the shop -----

alter table public.bookings drop constraint if exists bookings_technician_id_fkey;
alter table public.bookings drop constraint if exists bookings_shop_matches_technician;
alter table public.bookings add constraint bookings_shop_matches_technician
  foreign key (technician_id, shop_id) references public.technicians (id, shop_id)
  on delete set null (technician_id);

alter table public.bookings drop constraint if exists bookings_promo_code_id_fkey;
alter table public.bookings drop constraint if exists bookings_shop_matches_promo;
alter table public.bookings add constraint bookings_shop_matches_promo
  foreign key (promo_code_id, shop_id) references public.promo_codes (id, shop_id)
  on delete set null (promo_code_id);

-- payments, booking_events, invoices, service_feedback -> bookings: cascade ---

alter table public.payments drop constraint if exists payments_booking_id_fkey;
alter table public.payments drop constraint if exists payments_shop_matches_booking;
alter table public.payments add constraint payments_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id)
  on delete cascade;

alter table public.booking_events drop constraint if exists booking_events_booking_id_fkey;
alter table public.booking_events drop constraint if exists booking_events_shop_matches_booking;
alter table public.booking_events add constraint booking_events_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id)
  on delete cascade;

alter table public.invoices drop constraint if exists invoices_booking_id_fkey;
alter table public.invoices drop constraint if exists invoices_shop_matches_booking;
alter table public.invoices add constraint invoices_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id)
  on delete cascade;

alter table public.service_feedback drop constraint if exists service_feedback_booking_id_fkey;
alter table public.service_feedback drop constraint if exists service_feedback_shop_matches_booking;
alter table public.service_feedback add constraint service_feedback_shop_matches_booking
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id)
  on delete cascade;

-- promo_redemptions -> promo_codes: restrict ----------------------------------
--
-- A code that has been used cannot be deleted. Redemptions are what prove a
-- discount was given, so they must not lose the code that gave it.

alter table public.promo_redemptions drop constraint if exists promo_redemptions_promo_code_id_fkey;
alter table public.promo_redemptions drop constraint if exists promo_redemptions_shop_matches_code;
alter table public.promo_redemptions add constraint promo_redemptions_shop_matches_code
  foreign key (promo_code_id, shop_id) references public.promo_codes (id, shop_id)
  on delete restrict;

-- Deliberately untouched: service_feedback.service_id and .technician_id,
-- booking_events.technician_id and .actor_id, bookings.user_id and .asset_id,
-- promo_redemptions.booking_id and .profile_id, and every *_shop_id_fkey.
-- None of those pairs has a second key, so none of them is ambiguous, and each
-- is the only thing enforcing its own reference.
