-- TEST ONLY. Fixtures for scripts/leak-test.mjs.
--
-- These are not temporary despite the name — the leak suite is a committed
-- regression test and these two functions are its harness, so they stay. The
-- name is kept because renaming them would mean a drop, a create and an edit
-- to the script for no gain.
--
-- WHY THEY EXIST
--
-- The service role key bypasses RLS entirely, so a tenancy check run with it
-- passes whether or not the policies work. The suite therefore signs in as
-- real users — but it still needs two throwaway shops with real owners to sign
-- in as, and creating those means writing rows the API deliberately refuses:
-- profiles.role is guarded by prevent_self_role_escalation, and the seed sets
-- it directly with triggers suspended.
--
-- Everything is prefixed zz-leak so teardown can find it, and the suite checks
-- row counts back against a baseline rather than trusting teardown.
--
-- WHO MAY CALL THEM
--
-- service_role only, and the revoke below is the part that makes that true.
-- Postgres grants EXECUTE to PUBLIC by default on a new function, so naming
-- service_role in a grant adds a privilege without removing one — it excludes
-- nobody. An earlier version of this file did exactly that, and the result was
-- that any holder of the anon key could call temp_leak_seed and become the
-- owner of a shop they had just created in production, or call
-- temp_leak_teardown and delete every zz-leak shop and everything under it.
-- That was found by calling one of these probes with the anon key, not by
-- reading the grant.
--
-- Worth keeping in mind: the tenancy suite stayed green throughout, because
-- this was never a policy failure. A green RLS suite says nothing about what a
-- SECURITY DEFINER function will do for whoever is allowed to call it.

-- Seed ------------------------------------------------------------------------
--
-- Each test owner's profiles.role is set to 'shop_owner'. That matters: an
-- earlier version left them as 'customer', which made the suite pass before
-- phase 4 for the wrong reason. private.is_admin() reads profiles.role, so a
-- customer has no staff access anywhere and sees only their own rows — the
-- suite was proving "a customer sees their own bookings", which was already
-- true and is not the question. The leak being tested is that a shop_owner of
-- shop A can see shop B, because is_admin() is tenant blind.

create or replace function public.temp_leak_seed(p_owner_a uuid, p_owner_b uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tag text; owner uuid; shop uuid; cat uuid; svc uuid; bkg uuid; tech uuid;
  out jsonb := '{}'::jsonb;
begin
  set local session_replication_role = replica;

  foreach tag in array array['a', 'b'] loop
    owner := case tag when 'a' then p_owner_a else p_owner_b end;

    -- Shop staff, so is_admin() is true for them and the pre-phase-4 leak is
    -- reachable. Membership is what phase 4 narrows it back down to.
    update public.profiles
       set role = 'shop_owner', name = 'Leak Owner ' || upper(tag)
     where id = owner;

    insert into public.shops (slug, name, invoice_prefix)
    values ('zz-leak-' || tag, 'Leak Test ' || upper(tag), 'ZZ' || upper(tag))
    returning id into shop;

    insert into public.shop_members (shop_id, profile_id, role)
    values (shop, owner, 'shop_owner');

    insert into public.categories (name, slug, shop_id)
    values ('zz-leak ' || tag, 'zz-leak-cat-' || tag, shop) returning id into cat;

    insert into public.services (name, category_id, base_price, shop_id)
    values ('zz-leak service ' || tag, cat, 100, shop) returning id into svc;

    insert into public.technicians (name, status, shop_id)
    values ('zz-leak tech ' || tag, 'active', shop) returning id into tech;

    insert into public.bookings (
      user_id, service_id, scheduled_at, total_price, payment_method, status, shop_id
    )
    values (owner, svc, '2027-03-01T10:00:00Z', 100, 'cod', 'confirmed', shop)
    returning id into bkg;

    out := out || jsonb_build_object(tag, jsonb_build_object(
      'shop', shop, 'category', cat, 'service', svc, 'booking', bkg, 'technician', tech
    ));
  end loop;

  return out;
end;
$$;

-- Teardown --------------------------------------------------------------------
--
-- Children before parents, since the composite foreign keys phase 2 added mean
-- a shop cannot be deleted out from under its own rows.

create or replace function public.temp_leak_teardown()
returns jsonb language plpgsql security definer set search_path = public as $$
declare removed int := 0;
begin
  set local session_replication_role = replica;
  delete from public.booking_events where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.payments      where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.invoices      where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.bookings      where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.addons        where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.pricing_rules where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.services      where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.categories    where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.technicians   where shop_id in (select id from public.shops where slug like 'zz-leak%');
  delete from public.shop_members  where shop_id in (select id from public.shops where slug like 'zz-leak%');
  with gone as (delete from public.shops where slug like 'zz-leak%' returning 1)
  select count(*) into removed from gone;
  return jsonb_build_object('shops_removed', removed);
end;
$$;

-- Privileges ------------------------------------------------------------------
--
-- Revoke first, then grant. The revoke is not redundant with the grant: see
-- the header.

revoke all on function public.temp_leak_seed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.temp_leak_teardown() from public, anon, authenticated;

grant execute on function public.temp_leak_seed(uuid, uuid) to service_role;
grant execute on function public.temp_leak_teardown() to service_role;

comment on function public.temp_leak_seed is
  'Fixture for scripts/leak-test.mjs. service_role only — it creates shops and memberships, so PUBLIC must never hold EXECUTE.';
comment on function public.temp_leak_teardown is
  'Fixture for scripts/leak-test.mjs. service_role only — it deletes shops by slug prefix.';
