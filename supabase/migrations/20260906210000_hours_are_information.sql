-- Opening hours stop gating bookings.
--
-- The hours a shop publishes say when it is staffed — that is what the app
-- shows on the shop card, and it is what a customer wants to know before
-- turning up. They were also being used as a booking constraint: create_booking
-- refused any slot outside them, and the app's picker hid those slots
-- entirely, so the two enforced the same rule twice.
--
-- That conflates two different things. When a shop functions is information.
-- Whether it will take a particular job is the shop's decision, made per
-- booking, and the shop already makes it — every booking arrives as
-- pending_payment and is confirmed and assigned by hand. A request for 8pm on
-- a shop that closes at 7 is a request the shop can accept, move, or decline;
-- it is not something the database should refuse on the shop's behalf.
--
-- WHAT STILL REFUSES
--
-- A blocked date. shop_closures is the shop naming a specific day it will not
-- work — a holiday, a shutdown — which is a deliberate act rather than a
-- weekly pattern, and quite different from "we usually finish at seven". So
-- that check stays, and its message names the day rather than the slot,
-- because moving half an hour will not help.
--
-- is_open_at() is dropped rather than left unused. It answered the full
-- question — closure, weekday, and time window — and leaving a function by
-- that name sitting beside a booking path that deliberately ignores opening
-- hours is an invitation to wire it back in. What replaces it answers only the
-- question that still matters, and its name says so.

create or replace function private.is_blocked_on(p_shop uuid, p_at timestamptz)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.shop_closures
     where shop_id = p_shop
       -- Compared in the shop's own calendar day, not UTC: a booking at 01:00
       -- IST is the previous date in UTC, and a shop blocking the 5th means the
       -- 5th as it experiences it.
       and closed_on = (p_at at time zone 'Asia/Kolkata')::date
  );
$$;

comment on function private.is_blocked_on is
  'True when the shop has explicitly blocked that date. Opening hours are deliberately not consulted: they describe when the shop is staffed, not whether a booking may be requested.';

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

  -- Opening hours no longer decide whether a booking may be made. They say when
  -- the shop is staffed, which the app shows so a customer knows when to turn
  -- up; a request outside them is something the shop accepts or reschedules,
  -- not something the database refuses on its behalf.
  --
  -- A blocked date is different in kind. That is the shop naming a specific day
  -- it will not work, so it still refuses — and the message says day rather
  -- than slot, because moving half an hour will not help.
  if not (
       private.is_platform_admin()
       or v_shop in (select private.my_shop_ids())
     )
     and private.is_blocked_on(v_shop, p_scheduled_at) then
    raise exception 'The shop is closed on that date. Pick another day.'
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

-- Nothing calls it now; create_booking was its only caller.
drop function if exists private.is_open_at(uuid, timestamptz);
