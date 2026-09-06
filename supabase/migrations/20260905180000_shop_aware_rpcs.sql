-- Phase 5 of multi-tenancy: the functions learn which shop they are acting for.
--
-- THE SHOP IS DERIVED, NEVER PASSED
--
-- No public function gains a shop_id argument. The shop is read from the
-- service the customer chose, which belongs to exactly one shop by
-- construction. That matters for two reasons:
--
--   * A client-supplied shop_id is a client-supplied claim, and every write
--     would then have to prove it. Deriving it removes the question.
--   * create_booking and validate_promo_code keep their signatures, so the
--     mobile app keeps working untouched until phase 8.
--
-- private.compute_booking_price is deliberately NOT changed. It already scopes
-- add-ons with `a.service_id = s.id` and pricing rules the same way, and the
-- phase-2 composite foreign keys guarantee those rows share the service's
-- shop. It was tenant-safe before this migration and rewriting it would only
-- add risk.

-- Opening hours, per shop -----------------------------------------------------
--
-- This one was actively broken by phase 2, not merely imprecise: business_hours
-- now holds seven rows PER SHOP, so `where weekday = X` matches once per shop
-- and SELECT INTO would take an arbitrary one. A closure at any shop shut every
-- shop for the same reason.

drop function if exists private.is_open_at(timestamptz);

create or replace function private.is_open_at(p_shop uuid, p_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  h public.business_hours%rowtype;
  local_date date := (p_at at time zone 'Asia/Kolkata')::date;
  local_time time := (p_at at time zone 'Asia/Kolkata')::time;
begin
  if exists (
    select 1 from public.shop_closures
     where closed_on = local_date and shop_id = p_shop
  ) then
    return false;
  end if;

  select * into h from public.business_hours
   where shop_id = p_shop
     and weekday = extract(dow from local_date)::smallint;

  if not found or not h.is_open then
    return false;
  end if;

  -- The slot must start inside the window. A job running past closing is the
  -- shop's business; a job starting after closing is nobody's.
  return local_time >= h.opens_at and local_time < h.closes_at;
end;
$$;

comment on function private.is_open_at is
  'Times are read in Asia/Kolkata: opening hours are a wall-clock fact about a physical shop, not a UTC one. Scoped to one shop since phase 2.';

-- Promo codes, per shop -------------------------------------------------------
--
-- The old lookup was `where upper(code) = upper(trim(p_code))`. Two shops may
-- now both run FIRST100 — the phase-2 unique index is (shop_id, upper(code)) —
-- so an unscoped lookup would match two rows and SELECT INTO would silently
-- take one of them, discounting a booking against another shop's budget.

drop function if exists private.evaluate_promo_code(text, uuid, uuid, numeric);

create or replace function private.evaluate_promo_code(
  p_shop uuid,
  p_code text,
  p_profile_id uuid,
  p_service_id uuid,
  p_gross numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c public.promo_codes%rowtype;
  service_category uuid;
  used_total integer;
  used_by_customer integer;
  discount numeric(10, 2);
  fail jsonb;
begin
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('valid', false, 'reason', 'Enter a code.');
  end if;

  -- The ONLY change to this function: the lookup is scoped to one shop.
  -- Two shops may now both run FIRST100 — the phase-2 unique index is
  -- (shop_id, upper(code)) — so an unscoped lookup would match two rows and
  -- SELECT INTO would silently take one, discounting a booking against another
  -- shop's budget. Everything else below is untouched, including the single
  -- generic failure message, which deliberately does not reveal whether a code
  -- exists.
  select * into c from public.promo_codes
   where shop_id = p_shop and upper(code) = upper(trim(p_code));

  -- Every rejection below says the same thing for an unknown code as for a
  -- disabled one. Distinguishing them would turn this into an oracle for
  -- discovering codes that exist but are not yet live.
  fail := jsonb_build_object('valid', false, 'reason', 'That code is not valid.');

  if not found then return fail; end if;
  if not c.is_active then return fail; end if;
  if c.starts_at is not null and now() < c.starts_at then return fail; end if;

  if c.ends_at is not null and now() > c.ends_at then
    -- Expiry is worth naming: the customer probably had a valid code and left
    -- it too long, and "not valid" would read as though they mistyped it.
    return jsonb_build_object('valid', false, 'reason', 'That code has expired.');
  end if;

  -- Tested against the gross, before any admin discount on the booking.
  if p_gross < c.min_order_value then
    return jsonb_build_object(
      'valid', false,
      'reason', 'This code needs a booking of at least ' || to_char(c.min_order_value, 'FM999999') || '.'
    );
  end if;

  if c.applies_to = 'service' then
    if not (p_service_id = any(c.service_ids)) then
      return jsonb_build_object('valid', false, 'reason', 'That code does not apply to this service.');
    end if;
  elsif c.applies_to = 'category' then
    select category_id into service_category from public.services where id = p_service_id;
    if service_category is null or not (service_category = any(c.category_ids)) then
      return jsonb_build_object('valid', false, 'reason', 'That code does not apply to this service.');
    end if;
  end if;

  if c.max_redemptions is not null then
    select count(*) into used_total
      from public.promo_redemptions
     where promo_code_id = c.id and released_at is null;
    if used_total >= c.max_redemptions then
      return jsonb_build_object('valid', false, 'reason', 'This code has been fully claimed.');
    end if;
  end if;

  if c.per_customer_limit is not null and p_profile_id is not null then
    select count(*) into used_by_customer
      from public.promo_redemptions
     where promo_code_id = c.id and profile_id = p_profile_id and released_at is null;
    if used_by_customer >= c.per_customer_limit then
      return jsonb_build_object('valid', false, 'reason', 'You have already used this code.');
    end if;
  end if;

  if c.discount_type = 'percentage' then
    discount := round(p_gross * c.discount_value / 100, 2);
    if c.max_discount_amount is not null then
      discount := least(discount, c.max_discount_amount);
    end if;
  else
    discount := c.discount_value;
  end if;

  -- Never more than the job is worth; the rest is a refund, not a discount.
  discount := least(discount, p_gross);

  return jsonb_build_object(
    'valid', true,
    'promo_code_id', c.id,
    'code', c.code,
    'description', c.description,
    'discount_amount', discount,
    'net_price', p_gross - discount
  );
end;
$$;

-- The customer-facing preview. Signature unchanged; body unchanged except that
-- the shop is derived and handed to the evaluator, so what is previewed and
-- what is charged are decided the same way.
create or replace function public.validate_promo_code(
  p_code text,
  p_service_id uuid,
  p_asset_id uuid default null,
  p_addon_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := (select auth.uid());
  attrs jsonb := '{}'::jsonb;
  owner uuid;
  gross numeric(10, 2);
  v_shop uuid;
begin
  if uid is null then
    raise exception 'You need to be signed in' using errcode = 'insufficient_privilege';
  end if;

  if p_asset_id is not null then
    select attributes, user_id into attrs, owner
      from public.customer_assets where id = p_asset_id;
    if owner is distinct from uid and not private.is_admin() then
      raise exception 'Not your vehicle' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Same derivation as create_booking: the shop is whichever one sells this
  -- service, so the code previewed here is evaluated against exactly the shop
  -- that will charge for it.
  select shop_id into v_shop from public.services where id = p_service_id;
  if v_shop is null then
    raise exception 'That service no longer exists' using errcode = 'no_data_found';
  end if;

  gross := private.compute_booking_price(p_service_id, coalesce(attrs, '{}'::jsonb), p_addon_ids);

  return private.evaluate_promo_code(v_shop, p_code, uid, p_service_id, gross)
         || jsonb_build_object('gross', gross);
end;
$$;

revoke all on function public.validate_promo_code(text, uuid, uuid, uuid[]) from public;
revoke execute on function public.validate_promo_code(text, uuid, uuid, uuid[]) from anon;
grant execute on function public.validate_promo_code(text, uuid, uuid, uuid[]) to authenticated;

-- Booking creation -------------------------------------------------------------
--
-- Signature unchanged. The shop comes from the service.

create or replace function public.create_booking(
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_asset_id uuid default null,
  p_addon_ids uuid[] default '{}'::uuid[],
  p_contact_name text default null,
  p_contact_phone text default null,
  p_service_address text default null,
  p_service_city text default null,
  p_service_postal_code text default null,
  p_needs_pickup boolean default false,
  p_pickup_notes text default null,
  p_promo_code text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  attrs jsonb := '{}'::jsonb;
  owner uuid;
  price numeric(10, 2);
  promo jsonb;
  promo_id uuid := null;
  promo_discount numeric(10, 2) := 0;
  v_shop uuid;
  b public.bookings%rowtype;
begin
  if uid is null then
    raise exception 'You need to be signed in to book' using errcode = 'insufficient_privilege';
  end if;

  if p_scheduled_at is null or p_scheduled_at < now() then
    raise exception 'Pick a time in the future' using errcode = 'check_violation';
  end if;

  -- The shop is whichever one sells this service. Not an argument: a caller
  -- who could name the shop could book shop A's service against shop B's
  -- calendar, prices and promo codes.
  select shop_id into v_shop from public.services where id = p_service_id;
  if v_shop is null then
    raise exception 'That service no longer exists' using errcode = 'no_data_found';
  end if;

  -- Staff of THIS shop are exempt: a shop can always take a job outside its own
  -- hours if it chooses to. Staff of another shop are not, which the old
  -- tenant-blind is_admin() could not express.
  if not (
       private.is_platform_admin()
       or v_shop in (select private.my_shop_ids())
     )
     and not private.is_open_at(v_shop, p_scheduled_at) then
    raise exception 'We are closed at that time. Pick another slot.'
      using errcode = 'check_violation';
  end if;

  if p_asset_id is not null then
    select attributes, user_id into attrs, owner
      from public.customer_assets where id = p_asset_id;
    if not found then
      raise exception 'That vehicle no longer exists' using errcode = 'no_data_found';
    end if;
    if owner is distinct from uid then
      raise exception 'Not your vehicle' using errcode = 'insufficient_privilege';
    end if;
  end if;

  price := private.compute_booking_price(p_service_id, coalesce(attrs, '{}'::jsonb), p_addon_ids);

  if p_promo_code is not null and trim(p_promo_code) <> '' then
    -- Re-checked here, not trusted from the Apply step. A code can expire, be
    -- switched off, or hit its cap between the customer applying it and
    -- confirming — and the booking should say so rather than quietly charging
    -- the full price for something they believe is discounted.
    promo := private.evaluate_promo_code(v_shop, p_promo_code, uid, p_service_id, price);

    if not (promo ->> 'valid')::boolean then
      raise exception '%', promo ->> 'reason' using errcode = 'check_violation';
    end if;

    promo_id := (promo ->> 'promo_code_id')::uuid;
    promo_discount := (promo ->> 'discount_amount')::numeric;
  end if;

  -- user_id is taken from the session, never from an argument: passing it in
  -- would let a caller create bookings against someone else's account.
  --
  -- status, payment_method and technician_id are deliberately not set here.
  -- enforce_booking_insert_integrity forces them, and it also refuses the
  -- insert outright when online booking is switched off.
  insert into public.bookings (
    user_id, service_id, asset_id, addon_ids, scheduled_at, total_price,
    promo_code_id, promo_discount_amount, shop_id,
    contact_name, contact_phone, service_address, service_city,
    service_postal_code, needs_pickup, pickup_notes
  )
  values (
    uid, p_service_id, p_asset_id, coalesce(p_addon_ids, '{}'::uuid[]), p_scheduled_at, price,
    promo_id, promo_discount, v_shop,
    p_contact_name, p_contact_phone, p_service_address, p_service_city,
    p_service_postal_code, coalesce(p_needs_pickup, false),
    nullif(trim(coalesce(p_pickup_notes, '')), '')
  )
  returning * into b;

  if promo_id is not null then
    -- Same transaction as the booking. A redemption that could be written
    -- separately would drift: either a discount nobody is recorded as using,
    -- or a claim against a booking that failed.
    insert into public.promo_redemptions (
      promo_code_id, booking_id, profile_id, amount_discounted, shop_id
    )
    values (promo_id, b.id, uid, promo_discount, v_shop);
  end if;

  return b;
end;
$$;

comment on function public.create_booking is
  'The only booking-creation path open to customers. Derives the shop from the service, prices the job, re-validates any promo code against that shop, and refuses slots outside that shop''s opening hours — all server-side.';

-- Payment availability, per shop ------------------------------------------------
--
-- enforce_booking_insert_integrity read the app_settings singleton, so one
-- shop switching online payment off closed booking for every shop. The shops
-- table already carries both flags, copied in phase 1, so the values are
-- unchanged for the existing shop — only the scope is.

-- Scope only. The logic is deliberately identical to the version this
-- replaces: it still gates on online_payment_enabled alone, and still forces
-- payment_method to 'online' unconditionally, because COD is chosen afterwards
-- through choose_cash_on_delivery(). Widening the gate to "online OR cod"
-- would have started admitting bookings that are refused today — this shop has
-- online off and cod on — and a migration about tenancy is the wrong place to
-- change who may book.
create or replace function private.enforce_booking_insert_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  online_ok boolean;
begin
  -- Was private.is_admin(): staff anywhere. Now staff of this booking's shop.
  if private.is_platform_admin() or new.shop_id in (select private.my_shop_ids()) then
    return new;
  end if;

  -- Was the app_settings singleton, so one shop switching online payment off
  -- closed booking for every shop. The flags were copied to shops in phase 1,
  -- so the value is unchanged for the existing shop — only the scope is.
  select online_payment_enabled into online_ok
    from public.shops where id = new.shop_id;

  if not coalesce(online_ok, true) then
    raise exception 'Online booking is closed right now'
      using errcode = 'check_violation';
  end if;

  -- Forced rather than validated: the client has no say, so there is no
  -- payload that produces a confirmed-but-unpaid booking. COD is chosen
  -- afterwards through choose_cash_on_delivery().
  new.status := 'pending_payment';
  new.payment_method := 'online';
  new.technician_id := null;

  return new;
end;
$$;
