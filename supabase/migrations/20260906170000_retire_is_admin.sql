-- Retiring private.is_admin(): "staff, anywhere".
--
-- It answers `role in ('admin','shop_owner')` and says nothing about which
-- shop, which made it the root of every cross-tenant hole found in this work:
-- the shop_members roster, then profiles, customer_assets and device_tokens,
-- and a privilege escalation where a shop owner could set their own role to
-- 'admin'. Each was fixed where it was found. This removes the thing that
-- produced them, so it cannot be reached for again.
--
-- Two predicates replace it, and the choice between them is the whole point:
--
--   private.is_platform_admin()      above all shops — role changes, deletions
--   private.is_shop_staff(shop_id)   staff of THIS row's shop
--
-- Every function below already had the row, or something that names it, in
-- scope; none of them needed to know less than they were being told.
--
-- HOW THIS FILE WAS PRODUCED
--
-- Not by hand. Each body is the exact text pg_get_functiondef returned from
-- the live database, with one substitution applied and asserted — reconstructing
-- a function from memory has twice reverted a fix in this project, once
-- silently. The generator refuses if a pattern it expects to match once matches
-- zero or twice, and refuses if any body still mentions is_admin.

create or replace function private.is_shop_staff(p_shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_shop is not null
     and (
       private.is_platform_admin()
       or exists (
         select 1 from public.shop_members m
          where m.shop_id = p_shop
            and m.profile_id = (select auth.uid())
       )
     );
$$;

comment on function private.is_shop_staff is
  'Staff of one specific shop, or the platform tier above it. Scalar and per-row on purpose: it is for function bodies, which hold one row. Policies use the set-returning my_shop_ids()/my_admin_shop_ids() instead, which the planner hoists.';

-- A null shop is false rather than an error: a trigger firing on a row whose
-- shop_id has not been filled yet should refuse, not crash.


-- private.prevent_self_role_escalation
CREATE OR REPLACE FUNCTION private.prevent_self_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.role is distinct from old.role and not private.is_platform_admin() then
    raise exception 'Only admins can change a profile''s role';
  end if;
  return new;
end;
$function$;

-- private.enforce_customer_booking_transitions
CREATE OR REPLACE FUNCTION private.enforce_customer_booking_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.is_shop_staff(new.shop_id) or private.booking_state_change_allowed() then
    return new;
  end if;

  -- Only constrains the owning customer. Technicians are handled by
  -- enforce_technician_status_only_update; service_role has no uid and is
  -- trusted server code.
  if old.user_id is distinct from (select auth.uid()) then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'cancelled' then
      raise exception 'A booking is confirmed by Nexora, not by the customer'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status in ('completed', 'cancelled', 'in_progress') then
      raise exception 'A booking that is already % cannot be cancelled here', old.status
        using errcode = 'check_violation';
    end if;
  end if;

  if new.total_price is distinct from old.total_price
    or new.discount_amount is distinct from old.discount_amount
    or new.discount_reason is distinct from old.discount_reason
    or new.payment_method is distinct from old.payment_method
    or new.technician_id is distinct from old.technician_id
    or new.service_id is distinct from old.service_id
    or new.asset_id is distinct from old.asset_id
    or new.addon_ids is distinct from old.addon_ids
    or new.user_id is distinct from old.user_id
  then
    raise exception 'Only Nexora can change a booking''s price, discount, contents, payment method or technician'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

-- private.enforce_technician_status_only_update
CREATE OR REPLACE FUNCTION private.enforce_technician_status_only_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.is_shop_staff(old.shop_id) or old.user_id = auth.uid() then
    return new;
  end if;

  if old.technician_id = private.technician_id_for_current_user() then
    if new.user_id is distinct from old.user_id
      or new.service_id is distinct from old.service_id
      or new.asset_id is distinct from old.asset_id
      or new.addon_ids is distinct from old.addon_ids
      or new.scheduled_at is distinct from old.scheduled_at
      or new.technician_id is distinct from old.technician_id
      or new.total_price is distinct from old.total_price
    then
      raise exception 'Technicians may only update booking status';
    end if;
  end if;

  return new;
end;
$function$;

-- private.enforce_payment_integrity
CREATE OR REPLACE FUNCTION private.enforce_payment_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.is_shop_staff(new.shop_id) or private.booking_state_change_allowed() then
    return new;
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status <> 'created' then
    raise exception 'A payment starts as created; only Nexora can settle it'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'Only Nexora can change a payment''s status'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

-- private.enforce_feedback_integrity
CREATE OR REPLACE FUNCTION private.enforce_feedback_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.bookings%rowtype;
begin
  if private.is_shop_staff((select shop_id from public.bookings where id = new.booking_id)) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into b from public.bookings where id = new.booking_id;
    if not found or b.user_id is distinct from (select auth.uid()) then
      raise exception 'You can only review your own booking'
        using errcode = 'insufficient_privilege';
    end if;
    if b.status <> 'completed' then
      raise exception 'This job is not finished yet, so it cannot be reviewed'
        using errcode = 'check_violation';
    end if;

    -- Derived here, not trusted from the client, so a review cannot be
    -- attributed to a service or technician that had nothing to do with it.
    new.user_id := b.user_id;
    new.service_id := b.service_id;
    new.technician_id := b.technician_id;
    new.is_published := true;
    new.admin_response := null;
    new.responded_at := null;
    return new;
  end if;

  if new.is_published is distinct from old.is_published
    or new.admin_response is distinct from old.admin_response
    or new.responded_at is distinct from old.responded_at
    or new.booking_id is distinct from old.booking_id
    or new.service_id is distinct from old.service_id
    or new.technician_id is distinct from old.technician_id
    or new.user_id is distinct from old.user_id
  then
    raise exception 'Only Nexora can moderate or respond to a review'
      using errcode = 'insufficient_privilege';
  end if;

  -- A short window to fix a hasty rating, then it settles. Otherwise the
  -- averages keep moving under everyone.
  if old.created_at < now() - interval '7 days' then
    raise exception 'A review can only be changed within 7 days of leaving it'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- public.choose_cash_on_delivery
CREATE OR REPLACE FUNCTION public.choose_cash_on_delivery(p_booking_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.bookings%rowtype;
  cod_ok boolean;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  -- security definer bypasses RLS, so ownership is checked by hand.
  if b.user_id is distinct from (select auth.uid()) and not private.is_shop_staff(b.shop_id) then
    raise exception 'Not your booking' using errcode = 'insufficient_privilege';
  end if;

  -- This booking's shop, not the platform. Copied from app_settings in phase 1,
  -- so the answer is unchanged for the shop that exists today.
  select cod_enabled into cod_ok from public.shops where id = b.shop_id;
  if not coalesce(cod_ok, false) then
    raise exception 'Cash on delivery is not available right now'
      using errcode = 'check_violation';
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
$function$;

-- public.admin_force_delete_booking
CREATE OR REPLACE FUNCTION public.admin_force_delete_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  -- security definer bypasses RLS, so the caller is checked by hand — and
  -- against this booking's shop, not against being staff anywhere.
  if not private.is_shop_staff(b.shop_id) then
    raise exception 'Only this shop can delete its bookings'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('nexora.force_delete', 'on', true);

  -- Cascades take the payments, the feedback and the bill with it.
  delete from public.bookings where id = b.id;
end;
$function$;

-- public.admin_mark_paid_offline
CREATE OR REPLACE FUNCTION public.admin_mark_paid_offline(p_booking_id uuid, p_note text DEFAULT NULL::text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  -- security definer bypasses RLS, so the caller is checked by hand — and
  -- against this booking's shop, not against being staff anywhere.
  if not private.is_shop_staff(b.shop_id) then
    raise exception 'Only this shop can record a payment against its bookings'
      using errcode = 'insufficient_privilege';
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
$function$;

-- public.quote_booking_price
CREATE OR REPLACE FUNCTION public.quote_booking_price(p_service_id uuid, p_asset_id uuid DEFAULT NULL::uuid, p_addon_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  attrs jsonb := '{}'::jsonb;
  owner uuid;
begin
  if p_asset_id is not null then
    select attributes, user_id into attrs, owner
      from public.customer_assets where id = p_asset_id;

    -- security definer bypasses RLS, so ownership is checked by hand.
    if owner is distinct from (select auth.uid()) and not private.is_shop_staff((select shop_id from public.services where id = p_service_id)) then
      raise exception 'Not your vehicle' using errcode = 'insufficient_privilege';
    end if;
  end if;

  return private.compute_booking_price(p_service_id, coalesce(attrs, '{}'::jsonb), p_addon_ids);
end;
$function$;

-- public.validate_promo_code
CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text, p_service_id uuid, p_asset_id uuid DEFAULT NULL::uuid, p_addon_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if owner is distinct from uid and not private.is_shop_staff((select shop_id from public.services where id = p_service_id)) then
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
$function$;
