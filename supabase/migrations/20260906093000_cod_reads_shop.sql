-- The last function reading app_settings.
--
-- Everything else has moved: enforce_booking_insert_integrity and
-- raise_invoice_on_completion already read shops, and only matched a search
-- for "app_settings" because their comments still mention where the value used
-- to live. This one genuinely reads the singleton, which means one shop
-- switching cash off would switch it off for all ten.
--
-- The body below is the live definition with two changes and nothing else: the
-- source of cod_enabled, and its position. The flag has to be read after the
-- booking, because the booking is what says which shop to ask — so the "cash
-- is not available" check now happens after "booking not found" and "not your
-- booking" rather than before. That ordering is also the better one: it
-- answers questions about a booking only to someone entitled to ask.

create or replace function public.choose_cash_on_delivery(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b public.bookings%rowtype;
  cod_ok boolean;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  -- security definer bypasses RLS, so ownership is checked by hand.
  if b.user_id is distinct from (select auth.uid()) and not private.is_admin() then
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
