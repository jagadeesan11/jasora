-- A cash-only shop could not take a single booking.
--
-- WHAT HAPPENED
--
-- Every customer booking is forced to payment_method = 'online' and status =
-- 'pending_payment' on insert; cash is chosen afterwards through
-- choose_cash_on_delivery(), which is what stops a client crafting a payload
-- that lands confirmed-but-unpaid. That design is right and is kept.
--
-- The guard beside it was not. It refused the insert whenever the shop had
-- online payment switched off:
--
--   if not coalesce(online_ok, true) then
--     raise exception 'Online booking is closed right now';
--
-- which reads "online payment is unavailable" as "this shop is not open for
-- business". For a shop taking cash only — cod_enabled true,
-- online_payment_enabled false — those are opposite things, and the customer
-- got 23514 before they ever reached the screen where they would have chosen
-- cash. The payment screen already offers cash correctly in that
-- configuration; the booking simply never got far enough to show it.
--
-- This predates multi-tenancy: the check has had this shape since
-- 20260824120100, when app_settings was the only shop and the two flags
-- happened to be set the other way. Phase 5 changed where it reads the flag
-- from, not what it asks. Both shops are cash-only today, which is what
-- surfaced it.
--
-- WHAT IT SHOULD ASK
--
-- The real precondition is that the shop has some way of being paid at all.
-- The settings form already treats that as the invalid state — it warns when
-- both switches are off — so this makes the database agree with the screen
-- that edits it.
--
-- The message changes with the meaning. "Online booking is closed right now"
-- described a payment method to someone who had not chosen one yet.

create or replace function private.enforce_booking_insert_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cod_ok boolean;
  online_ok boolean;
begin
  -- Staff of this booking's shop, or the platform tier, are exempt: a shop can
  -- always take a job on its own terms.
  if private.is_platform_admin() or new.shop_id in (select private.my_shop_ids()) then
    return new;
  end if;

  select cod_enabled, online_payment_enabled
    into cod_ok, online_ok
    from public.shops where id = new.shop_id;

  -- Both off means there is no way to pay, and no booking worth taking. Either
  -- one on is enough to get started: the method is settled on the payment
  -- screen, not here.
  --
  -- coalesce to false rather than true. The old default let a booking through
  -- when the shop row could not be read; new.shop_id carries a foreign key to
  -- shops so that cannot happen, and refusing is the safer reading of "I could
  -- not find out".
  if not coalesce(online_ok, false) and not coalesce(cod_ok, false) then
    raise exception 'This shop is not taking bookings right now'
      using errcode = 'check_violation';
  end if;

  -- Forced rather than validated: the client has no say, so there is no
  -- payload that produces a confirmed-but-unpaid booking. COD is chosen
  -- afterwards through choose_cash_on_delivery(), which checks cod_enabled for
  -- this shop in its own right.
  new.status := 'pending_payment';
  new.payment_method := 'online';
  new.technician_id := null;

  return new;
end;
$$;
