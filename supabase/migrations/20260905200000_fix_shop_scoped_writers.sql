-- Phase 6, part two: the writers that phase 2 broke.
--
-- Phase 2 made shop_id NOT NULL on booking_events, payments and invoices, but
-- the triggers and functions that INSERT into those tables were never updated.
--
-- That was not latent. record_booking_event fires on every booking UPDATE, so
-- assigning, starting or completing a job has been failing outright since phase
-- 2 with a not-null violation. It went unnoticed because the phase-2 and
-- phase-4 checks exercised reads, inserts and policies — never the update path
-- that the owner app actually uses all day.
--
-- Also corrected: the first half of phase 6 rebuilt raise_invoice_on_completion
-- from 20260825110000, but that function had been redefined twice since — most
-- recently by 20260829150000, which added the missing promo line to bills so
-- that a discounted bill's lines summed to its own total. Rebuilding from the
-- older file silently reverted that fix. This version comes from the true
-- latest definition.
--
-- Every body below is the newest existing definition with only shop scoping
-- added. Nothing else about them is changed.

create or replace function private.raise_invoice_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.services%rowtype;
  sh public.shops%rowtype;
  p public.profiles%rowtype;
  promo_code text;
  addon_lines jsonb := '[]'::jsonb;
  addon_total numeric(10, 2) := 0;
  service_amount numeric(10, 2);
  items jsonb;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  if exists (select 1 from public.invoices where booking_id = new.id) then
    return new;
  end if;

  select * into s from public.services where id = new.service_id;
  select * into sh from public.shops where id = new.shop_id;
  select * into p from public.profiles where id = new.user_id;

  select coalesce(jsonb_agg(jsonb_build_object('description', a.name, 'amount', a.price)), '[]'::jsonb),
         coalesce(sum(a.price), 0)
    into addon_lines, addon_total
    from public.addons a
   where a.id = any(new.addon_ids);

  -- The booking's total is what was agreed and is authoritative. The service
  -- line is the remainder after add-ons, so the printed lines always sum to
  -- the amount actually charged even if an add-on's price changed since.
  service_amount := new.total_price - addon_total;

  if service_amount < 0 then
    -- Add-on prices moved enough to make the split nonsense. One honest line
    -- beats a breakdown that implies a discount nobody gave.
    items := jsonb_build_array(
      jsonb_build_object('description', coalesce(s.name, 'Service'), 'amount', new.total_price)
    );
  else
    items := jsonb_build_array(
      jsonb_build_object('description', coalesce(s.name, 'Service'), 'amount', service_amount)
    ) || addon_lines;
  end if;

  -- The customer's own promo code, named so the bill explains itself. Read
  -- from the code table rather than stored on the booking, but falls back to a
  -- generic label if the code was deleted after the job.
  if new.promo_discount_amount > 0 then
    select code into promo_code from public.promo_codes where id = new.promo_code_id;
    items := items || jsonb_build_array(jsonb_build_object(
      'description', coalesce('Promo code ' || promo_code, 'Promo code'),
      'amount', -new.promo_discount_amount
    ));
  end if;

  -- The shop's own discount, if one was granted.
  if new.discount_amount > 0 then
    items := items || jsonb_build_array(jsonb_build_object(
      'description', coalesce(nullif(trim(new.discount_reason), ''), 'Discount'),
      'amount', -new.discount_amount
    ));
  end if;

  insert into public.invoices (booking_id, shop_id, number, line_items, total, payment_method, seller, buyer)
  values (
    new.id,
    new.shop_id,
    private.next_invoice_number(new.shop_id, now()),
    items,
    new.net_price,
    new.payment_method,
    jsonb_build_object(
      'name', coalesce(sh.name, 'Nexora'),
      'address_line', sh.address_line,
      'city', sh.city,
      'postal_code', sh.postal_code,
      'phone', sh.support_phone,
      'email', sh.support_email
    ),
    jsonb_build_object(
      'name', coalesce(new.contact_name, p.name),
      'phone', coalesce(new.contact_phone, p.phone),
      'address_line', coalesce(new.service_address, p.address_line),
      'city', coalesce(new.service_city, p.city),
      'postal_code', coalesce(new.service_postal_code, p.postal_code)
    )
  );

  return new;
end;
$$;

create or replace function private.record_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  actor uuid;
begin
  -- Null unless this really is a profile we hold, so the FK can never fail.
  select p.id into actor from public.profiles p where p.id = (select auth.uid());

  if new.status is distinct from old.status then
    kind := case new.status
      when 'confirmed' then 'confirmed'
      when 'assigned' then 'assigned'
      when 'in_progress' then 'started'
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'pending_payment' then 'reopened'
      else null
    end;

    if kind is not null then
      insert into public.booking_events (
        booking_id, shop_id, event, from_status, to_status, technician_id, actor_id
      )
      values (new.id, new.shop_id, kind, old.status, new.status, new.technician_id, actor);
    end if;

  elsif new.technician_id is distinct from old.technician_id then
    -- Only reached when the technician moved *without* a status change.
    -- Assigning sets both at once, and that is one decision, so it earns one
    -- line on the timeline rather than two.
    insert into public.booking_events (
      booking_id, shop_id, event, from_status, to_status, technician_id, actor_id
    )
    values (
      new.id,
      new.shop_id,
      case when new.technician_id is null then 'unassigned' else 'reassigned' end,
      old.status, new.status, new.technician_id, actor
    );
  end if;

  return new;
end;
$$;

create or replace function public.choose_cash_on_delivery(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  cod_ok boolean;
begin
  select cod_enabled into cod_ok from public.app_settings where id;
  if not coalesce(cod_ok, false) then
    raise exception 'Cash on delivery is not available right now'
      using errcode = 'check_violation';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  -- security definer bypasses RLS, so ownership is checked by hand.
  if b.user_id is distinct from (select auth.uid()) and not private.is_admin() then
    raise exception 'Not your booking' using errcode = 'insufficient_privilege';
  end if;

  if b.status <> 'pending_payment' then
    raise exception 'This booking is already %, so it cannot switch to cash', b.status
      using errcode = 'check_violation';
  end if;

  perform set_config('nexora.booking_state_change', 'on', true);

  update public.bookings
     set payment_method = 'cod',
         status = 'confirmed'
   where id = b.id
  returning * into b;

  -- The money is still owed, so the payment row exists and stays 'created'
  -- until an admin marks it collected. Without it, COD jobs would be
  -- invisible in revenue reporting.
  insert into public.payments (booking_id, shop_id, amount, status, method)
  values (b.id, b.shop_id, b.net_price, 'created', 'cash');

  return b;
end;
$$;

create or replace function public.admin_mark_paid_offline(
  p_booking_id uuid,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
begin
  -- security definer bypasses RLS, so the caller is checked by hand.
  if not private.is_admin() then
    raise exception 'Only an admin can record an offline payment'
      using errcode = 'insufficient_privilege';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  if b.status <> 'pending_payment' then
    raise exception 'This booking is already %, so it is not awaiting payment', b.status
      using errcode = 'check_violation';
  end if;

  perform set_config('nexora.booking_state_change', 'on', true);

  update public.bookings
     set payment_method = 'offline',
         status = 'confirmed'
   where id = b.id
  returning * into b;

  -- Marked paid, not merely created: the money is already in hand, which is
  -- the whole point of this path.
  insert into public.payments (booking_id, shop_id, amount, status, method)
  values (b.id, b.shop_id, b.net_price, 'paid', 'offline');

  return b;
end;
$$;
