-- A new shop opens with a week of hours.
--
-- business_hours is keyed (shop_id, weekday) since phase 2, so a shop created
-- today has no rows at all — and with no rows, weekSchedule() returns nothing,
-- the hours card renders nothing, and getBookableDays() offers no day the
-- customer can pick. A brand-new shop would look finished in the admin panel
-- and take no bookings, with nothing on screen saying why.
--
-- A trigger rather than something the create-shop form does, because the form
-- is not the only way a shop gets made: the leak fixtures create them, and so
-- will whatever imports the next one. This way the seven rows are a property
-- of a shop existing, not of the path that created it.
--
-- Monday to Saturday 09:00-20:00 and Sunday 10:00-14:00, copied from the shop
-- that already exists. These are a starting point the owner edits under Hours,
-- not a policy — the point is that the shop is bookable from the moment it is
-- created rather than silently closed.

create or replace function private.seed_business_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_hours (shop_id, weekday, is_open, opens_at, closes_at)
  select new.id, d.weekday, true, d.opens, d.closes
    from (values
      (0, time '10:00', time '14:00'),
      (1, time '09:00', time '20:00'),
      (2, time '09:00', time '20:00'),
      (3, time '09:00', time '20:00'),
      (4, time '09:00', time '20:00'),
      (5, time '09:00', time '20:00'),
      (6, time '09:00', time '20:00')
    ) as d(weekday, opens, closes)
  -- Nothing is overwritten. A restore or an import that brings its own hours
  -- keeps them.
  on conflict (shop_id, weekday) do nothing;

  return new;
end;
$$;

comment on function private.seed_business_hours is
  'Gives a new shop a full week of opening hours, so it is bookable the moment it exists.';

drop trigger if exists seed_business_hours on public.shops;
create trigger seed_business_hours
  after insert on public.shops
  for each row execute function private.seed_business_hours();
