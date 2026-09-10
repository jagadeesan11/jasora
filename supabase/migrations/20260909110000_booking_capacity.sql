-- How much work a shop can have in hand at once.
--
-- WHAT WAS MISSING
--
-- create_booking validated the shop, the price, the promo code and blocked
-- dates. It never asked whether anyone else had already taken the slot, and
-- nothing else did either — no capacity, no bays, no unique constraint. Ten
-- customers could book the same shop for the same morning and every one of
-- them was told "confirmed". The shop found out on the day.
--
-- WHY IT MATTERS MORE HERE THAN IN MOST BOOKING APPS
--
-- These jobs are not half-hour appointments. The live services run to 1440 and
-- 3600 minutes — a day, and sixty hours. A paint protection job holds a bay
-- until Thursday, so a shop with one bay that takes four bookings for Monday
-- has not overbooked by a little.
--
-- The duration was already there on services and simply unused for this.
--
-- WHAT COUNTS AS FULL
--
-- Overlap, not equality: two jobs collide when each begins before the other
-- ends. Booking a slot in the middle of an existing sixty-hour job has to be
-- refused, and a start-time comparison would wave it through.
--
-- Only live work counts — pending_payment, confirmed, assigned, in_progress.
-- Cancelled and completed jobs free the bay.
--
-- A service with no duration is treated as an hour. That is a floor rather
-- than a guess: without it a null would mean zero, no job would ever overlap,
-- and capacity would silently do nothing for that service. The real answer is
-- for the shop to set a duration, which the admin form already asks for.

alter table public.shops
  add column if not exists concurrent_jobs integer not null default 1
    check (concurrent_jobs between 1 and 50);

comment on column public.shops.concurrent_jobs is
  'How many jobs this shop can have in hand at the same time — bays, ramps, or however it counts. Bookings that would exceed it are refused.';

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
  v_capacity integer;
  v_taken integer;
  v_duration integer;
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
  select shop_id, duration_minutes into v_shop, v_duration
    from public.services where id = p_service_id;
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

  -- Capacity, checked here and nowhere else that matters.
  --
  -- The advisory lock is the whole point. Counting overlapping jobs and then
  -- inserting is two statements, and two customers tapping at the same instant
  -- would both count the same free bay and both take it. The lock serialises
  -- booking creation per shop for the rest of the transaction, so the second
  -- caller counts the first one's booking. It is per shop rather than global,
  -- so one busy shop never blocks another.
  perform pg_advisory_xact_lock(hashtext(v_shop::text));

  select s.concurrent_jobs into v_capacity from public.shops s where s.id = v_shop;

  select count(*) into v_taken
    from public.bookings existing
    join public.services es on es.id = existing.service_id
   where existing.shop_id = v_shop
     and existing.status in ('pending_payment', 'confirmed', 'assigned', 'in_progress')
     -- Two jobs overlap when each starts before the other ends. Durations here
     -- run to days rather than minutes — a paint protection job is sixty hours —
     -- so this is the difference between a bay being free and being occupied
     -- until Thursday.
     and existing.scheduled_at
           < p_scheduled_at + make_interval(mins => coalesce(v_duration, 60))
     and p_scheduled_at
           < existing.scheduled_at + make_interval(mins => coalesce(es.duration_minutes, 60));

  if v_taken >= coalesce(v_capacity, 1) then
    raise exception 'That time is fully booked. Please pick another slot.'
      using errcode = 'check_violation';
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
