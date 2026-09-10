-- Which times a shop is already full, for the slot picker.
--
-- create_booking refuses an overbooked slot, which is where correctness has to
-- live — two people tapping at the same instant can only be settled at the
-- point of writing. But being refused after choosing a vehicle, an address and
-- a time is a bad way to learn a bay was taken. The picker needs to know
-- beforehand, and a customer cannot read other people's bookings to work it
-- out.
--
-- So: a function that answers only "when is this shop occupied", and nothing
-- about by whom, for what, or for how much. That is the same thing any booking
-- calendar shows publicly, and it is the least that lets the picker grey out a
-- slot honestly.
--
-- Bounded by the caller's window so it cannot be used to walk a shop's whole
-- history, and capped, so a wide range cannot be used to pull the lot.

create or replace function public.shop_busy_intervals(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select b.scheduled_at,
         -- The same floor create_booking applies: a service with no duration
         -- occupies an hour rather than nothing, or capacity would silently
         -- stop applying to it.
         b.scheduled_at + make_interval(mins => coalesce(s.duration_minutes, 60))
    from public.bookings b
    join public.services s on s.id = b.service_id
   where b.shop_id = p_shop
     and b.status in ('pending_payment', 'confirmed', 'assigned', 'in_progress')
     -- Overlapping the asked-for window, not merely starting inside it: a job
     -- that began yesterday and runs until tomorrow occupies today.
     and b.scheduled_at < p_to
     and b.scheduled_at + make_interval(mins => coalesce(s.duration_minutes, 60)) > p_from
   order by b.scheduled_at
   limit 500;
$$;

comment on function public.shop_busy_intervals is
  'When a shop is occupied, for the slot picker. Deliberately returns times and nothing else — no customer, no service, no price — because a customer needs to know a bay is taken, not who took it.';

-- Readable by anyone who can see the shop front, which is anyone: the picker
-- runs before a customer has committed to anything, and on the web build
-- before they have necessarily signed in.
revoke all on function public.shop_busy_intervals(uuid, timestamptz, timestamptz) from public;
grant execute on function public.shop_busy_intervals(uuid, timestamptz, timestamptz)
  to anon, authenticated, service_role;
