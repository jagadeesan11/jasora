-- Phase 1 of multi-tenancy: the tenant root, and who belongs to it.
--
-- Deliberately additive. `app_settings` is left exactly as it is, still the
-- singleton, still the only thing the mobile and admin apps read. Nothing in
-- this migration changes behaviour for the shop that exists today — it only
-- creates the structure the later phases hang off, so this can ship on its own
-- without a coordinated app release.
--
-- The tenant root is a table because `app_settings` cannot be one: it is a
-- singleton by constraint (`id boolean` plus `check (id)`), which permits
-- exactly one row by design.

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  -- Stable, human-readable, and safe in a URL or a storage path. This is what
  -- a per-shop deep link and a per-shop object prefix will be built from, so it
  -- is constrained rather than free text.
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  name text not null,

  -- Shop-front details, mirroring app_settings. Copied rather than moved:
  -- app_settings remains the live source until phase 8 retires it.
  logo_url text
    check (
      logo_url is null
      or logo_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[^\s]+$'
    ),
  support_email text,
  support_phone text,
  address_line text,
  city text,
  postal_code text,
  privacy_url text,
  terms_url text,
  instagram_url text
    check (
      instagram_url is null
      or instagram_url ~ '^https://([a-z0-9-]+\.)?instagram\.com/[^\s]+$'
    ),
  whatsapp_number text
    check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),

  cod_enabled boolean not null default false,
  online_payment_enabled boolean not null default true,

  -- Invoice numbers are "MC/2026-27/0008". The prefix is per-shop and must be
  -- unique, because it is the only thing distinguishing two shops' bills once
  -- they are printed and filed.
  invoice_prefix text not null unique
    check (invoice_prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),

  -- A shop can be switched off without deleting its history.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.shops
  for each row execute function private.set_updated_at();

comment on table public.shops is
  'One row per shop. The tenant root: every shop-owned table will carry shop_id referencing this.';

-- Membership -----------------------------------------------------------------
--
-- A join table, not a column on profiles. Staff belong to one shop, but a
-- customer may book at several — putting shop_id on profiles would quietly
-- decide that a person can only ever use one shop, and unpicking that later
-- means rewriting every customer's history.
--
-- Customers are deliberately NOT members. Membership means "works here". A
-- customer's relationship to a shop is their bookings, which is a different
-- thing and already recorded.

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('shop_owner', 'technician')),
  created_at timestamptz not null default now(),
  primary key (shop_id, profile_id)
);

-- "Which shops am I in" is the hot direction — every policy in phase 4 asks it.
create index shop_members_profile_idx on public.shop_members(profile_id);

comment on table public.shop_members is
  'Who works at which shop. Customers are not members; their link to a shop is their bookings.';

-- Seed the existing shop ------------------------------------------------------
--
-- Everything in the database today belongs to this one shop, so it needs a row
-- before phase 2 can backfill shop_id against it. Values are copied from the
-- live app_settings rather than retyped, so the two cannot disagree.

insert into public.shops (
  slug, name, logo_url, support_email, support_phone,
  address_line, city, postal_code,
  privacy_url, terms_url, instagram_url, whatsapp_number,
  cod_enabled, online_payment_enabled, invoice_prefix
)
select
  'moto-ceramic',
  s.shop_name,
  s.shop_logo_url,
  s.support_email,
  s.support_phone,
  s.shop_address_line,
  s.shop_city,
  s.shop_postal_code,
  s.privacy_url,
  s.terms_url,
  s.instagram_url,
  s.whatsapp_number,
  s.cod_enabled,
  s.online_payment_enabled,
  -- Matches the prefix already burned into every issued invoice number.
  'MC'
from public.app_settings s
where s.id;

-- Everyone already running the shop becomes a member of it. Admins are not
-- included: platform administration is a different tier and is added in phase
-- 3, and an admin who is not staff at a shop should not appear on its team.
insert into public.shop_members (shop_id, profile_id, role)
select (select id from public.shops where slug = 'moto-ceramic'), p.id, p.role
from public.profiles p
where p.role in ('shop_owner', 'technician');

-- Access ----------------------------------------------------------------------
--
-- Read access for shops matches app_settings: anyone, including anon. This is
-- shop-front information — name, hours, logo — and the customer app reads it
-- before anybody signs in.
--
-- Writes stay with the existing admin check for now. Phase 3 replaces this with
-- is_shop_admin(), once the helper exists; doing it here would mean writing the
-- policy twice.

alter table public.shops enable row level security;

create policy "shops_public_read" on public.shops for select using (true);

create policy "shops_admin_insert" on public.shops
  for insert with check (private.is_full_admin());
create policy "shops_admin_update" on public.shops
  for update using (private.is_admin()) with check (private.is_admin());

-- Membership is not public: it lists who works where, which is staff data.
alter table public.shop_members enable row level security;

create policy "shop_members_read" on public.shop_members
  for select using (
    private.is_admin()
    or profile_id = (select auth.uid())
  );

create policy "shop_members_admin_write" on public.shop_members
  for all using (private.is_admin()) with check (private.is_admin());

-- Grants are checked before policies, so these are what actually decide
-- whether anon can reach the tables at all.
revoke all on public.shops from anon, authenticated;
grant select on public.shops to anon, authenticated;
grant insert, update on public.shops to authenticated;

revoke all on public.shop_members from anon, authenticated;
grant select, insert, update, delete on public.shop_members to authenticated;
