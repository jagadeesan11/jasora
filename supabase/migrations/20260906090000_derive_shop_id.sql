-- Phase 8: every child row learns its own shop, so no client has to tell it.
--
-- WHAT IS BROKEN RIGHT NOW
--
-- Phase 2 added shop_id to sixteen tables and made it NOT NULL, with no
-- default. Every INSERT in both clients predates that column, so eleven live
-- write paths currently fail outright with 23502:
--
--   mobile  support_requests, service_feedback, shop_closures, promo_codes,
--           technicians
--   admin   categories, services, pricing_rules, addons, promo_codes,
--           technicians
--
-- This is the same mistake as phase 2's record_booking_event, which stopped
-- every booking update: a NOT NULL column added underneath writers that were
-- never revisited. It was found the same way — by exercising the write path
-- rather than reading it.
--
-- WHAT THIS MIGRATION DOES, AND WHAT IT DELIBERATELY DOES NOT
--
-- Four of those tables hang off a parent that already knows the shop:
--
--   services         -> categories
--   pricing_rules    -> services
--   addons           -> services
--   service_feedback -> bookings
--
-- For those, shop_id is not information the caller has; it is a fact about the
-- parent. Deriving it is exact, cannot be forgotten, and cannot disagree with
-- the parent — phase 2's composite foreign keys already refuse a child whose
-- shop_id differs from its parent's, so the trigger and the constraint are
-- computing the same answer and the constraint stays the authority.
--
-- The remaining tables — categories, technicians, promo_codes, business_hours,
-- shop_closures, input_templates, support_requests — have no parent to ask.
-- For those the shop is a genuine choice, and this migration deliberately does
-- NOT guess it.
--
-- The tempting guess is "the caller's shop, when they administer exactly one".
-- It is rejected because it is right only until it is wrong: it would work for
-- every developer testing against this one-shop install and start silently
-- filing rows under an arbitrary shop the day an owner takes on a second, or
-- fail confusingly for a platform admin who administers all of them. A caller
-- that does not say which shop it means should be told so. The clients are
-- changed in the same phase to say it.
--
-- So: derived where it is derivable from data, required where it is a decision.

create or replace function private.derive_shop_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  -- An explicit shop_id is always honoured. The composite foreign key checks it
  -- against the parent immediately afterwards, so a wrong one is still refused.
  if new.shop_id is not null then
    return new;
  end if;

  -- TG_ARGV[0] is the parent table, [1] the column on this row pointing at it.
  execute format('select shop_id from public.%I where id = $1', TG_ARGV[0])
    into v_shop
    using (to_jsonb(new) ->> TG_ARGV[1])::uuid;

  -- A null parent reference is left alone rather than reported here: the NOT
  -- NULL violation that follows names the column, and the foreign key names the
  -- parent, which together say more than anything this trigger could add.
  new.shop_id := v_shop;
  return new;
end;
$$;

comment on function private.derive_shop_id is
  'BEFORE INSERT: fills shop_id from the parent row named in the trigger arguments. Only for tables whose shop is a fact about their parent, never a guess about the caller.';

-- SECURITY DEFINER because the parent tables are themselves behind RLS, and a
-- customer leaving feedback can read the service but a policy evaluated
-- mid-insert is a poor place to depend on that. It reads one shop_id by primary
-- key and returns nothing to the caller, so it discloses nothing: the caller
-- already holds the parent's id, and a wrong parent is refused by the foreign
-- key either way.

drop trigger if exists derive_shop_id on public.services;
create trigger derive_shop_id
  before insert on public.services
  for each row execute function private.derive_shop_id('categories', 'category_id');

drop trigger if exists derive_shop_id on public.pricing_rules;
create trigger derive_shop_id
  before insert on public.pricing_rules
  for each row execute function private.derive_shop_id('services', 'service_id');

drop trigger if exists derive_shop_id on public.addons;
create trigger derive_shop_id
  before insert on public.addons
  for each row execute function private.derive_shop_id('services', 'service_id');

drop trigger if exists derive_shop_id on public.service_feedback;
create trigger derive_shop_id
  before insert on public.service_feedback
  for each row execute function private.derive_shop_id('bookings', 'booking_id');
