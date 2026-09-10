-- Where a shop is, and how far it will travel.
--
-- The point is serviceability, not proximity: a customer in Madurai should not
-- be shown a shop in Chennai, because that shop cannot do the job. Distance is
-- how that gets decided, but the threshold is not a property of the app.
--
-- WHY THE RADIUS BELONGS TO THE SHOP
--
-- A single platform-wide number cannot express it. A shop that collects
-- vehicles genuinely serves 150km; one taking walk-ins does not serve 60. A
-- constant in the app would be the platform deciding coverage on behalf of
-- businesses it does not run — the same mistake as putting a shop's warranty in
-- the platform's terms. So each shop carries its own, and an owner extending
-- their range changes their own number.
--
-- WHY PLAIN COLUMNS RATHER THAN POSTGIS
--
-- At this scale the distance filter runs on the phone: every active shop is
-- already fetched for the home list, so this is arithmetic over data the client
-- is holding. PostGIS is the right answer at thousands of shops and an
-- unnecessary extension at ten. When it stops being so — a few hundred rows,
-- when `select * from shops` is no longer something to send to a phone — the
-- move is an RPC doing a bounding-box prefilter on these columns, and only
-- then a geography type and a GIST index.
--
-- Both coordinates stay nullable. A shop that has not set its pin must still
-- appear in the app, unsorted, rather than vanishing from the listing because
-- of a field its owner has not filled in yet.

alter table public.shops
  add column if not exists latitude double precision
    check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude double precision
    check (longitude is null or longitude between -180 and 180),
  -- 100km by default, which covers a district and its neighbours without
  -- reaching the next city. An owner narrows or widens it from the admin panel.
  add column if not exists service_radius_km integer not null default 100
    check (service_radius_km between 1 and 1000);

comment on column public.shops.latitude is
  'Decimal degrees. Null means the shop has not set its location — it is still listed, just not distance-filtered.';
comment on column public.shops.service_radius_km is
  'How far this shop will serve, in kilometres. Set by the shop, because only the shop knows whether it collects vehicles.';

-- A half-set pin is worse than none: it would place the shop on the equator or
-- the prime meridian and quietly filter it out of everywhere it actually works.
alter table public.shops
  add constraint shops_location_complete
  check ((latitude is null) = (longitude is null));
