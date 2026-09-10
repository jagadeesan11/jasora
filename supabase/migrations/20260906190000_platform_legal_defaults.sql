-- Legal documents that belong to the platform, not to a shop.
--
-- WHY A SINGLETON, HAVING JUST RETIRED ONE
--
-- app_settings was a singleton because the product assumed one shop, and that
-- assumption was wrong. This is the opposite case: there genuinely is one
-- platform. The privacy policy describes who holds personal data and what they
-- do with it, and that is Nexora — every shop's customers live in one database
-- the platform controls, decides retention for, and answers grievances about.
-- A shop cannot honour a deletion request against a database it does not
-- administer, so a per-shop privacy policy would describe processing nobody at
-- that shop performs. One document is the accurate one.
--
-- App stores agree by construction: a listing carries exactly one privacy
-- policy URL.
--
-- WHAT THIS FIXES TODAY
--
-- shops.privacy_url and shops.terms_url default to null, so a shop created
-- through the new Shops screen ships with no policy at all — its customers see
-- "not published yet" where the privacy policy should be. That is a gap that
-- grows by one every time a shop is onboarded, and nothing in the product
-- points it out.
--
-- So the shop columns stop being the source and become an override: the
-- platform document applies to everyone, and a shop names its own only if it
-- genuinely needs to. Resolution is `shop.privacy_url ?? platform.privacy_url`,
-- which means onboarding a shop can no longer forget this.
--
-- NOT COVERED HERE, DELIBERATELY
--
-- Terms of the service being bought — cancellation, refunds, warranty on the
-- work, liability for a vehicle in the bay — genuinely differ between
-- independent shops and are a contract between the customer and that shop.
-- Those need a separate per-shop field surfaced at booking time, and they need
-- content each owner provides. Defaulting them to a platform document would
-- have the platform making warranty promises on behalf of businesses it does
-- not run, which is worse than leaving them empty.

create table public.platform_settings (
  -- The singleton pattern: one row, enforced by the type rather than by
  -- convention or a trigger.
  id boolean primary key default true check (id),

  privacy_url text
    check (
      privacy_url is null
      or privacy_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[^\s]+$'
      or privacy_url ~ '^https://[^\s]+$'
    ),
  terms_url text
    check (
      terms_url is null
      or terms_url ~ '^https://[^\s]+$'
    ),

  updated_at timestamptz not null default now()
);

comment on table public.platform_settings is
  'Platform-wide configuration — one row. Shop-specific settings live on shops; this is for what is true of Nexora itself, such as the privacy policy every shop operates under.';

create trigger set_updated_at
  before update on public.platform_settings
  for each row execute function private.set_updated_at();

-- Seeded from the shop that exists, because those URLs are already the Nexora
-- platform documents rather than anything specific to Moto Ceramic — the files
-- are literally named Nexora_Privacy_Policy.pdf and Nexora_Terms_of_Service.pdf.
insert into public.platform_settings (id, privacy_url, terms_url)
select true, s.privacy_url, s.terms_url
  from public.shops s
 where s.privacy_url is not null
 order by s.created_at
 limit 1
on conflict (id) do nothing;

-- If no shop had one, still create the row so the app has something to read.
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Readable by everyone, signed in or not: a privacy policy that only
-- authenticated users can find is not a privacy policy, and an app store
-- reviewer has no account.
create policy "platform_settings_public_read" on public.platform_settings
  for select using (true);

-- Writable only by the tier that owns the document.
create policy "platform_settings_platform_write" on public.platform_settings
  for all
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

-- Grants are checked before policies, so these are what actually decide
-- whether anon can reach the table at all.
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;

-- No INSERT and no DELETE granted: the row exists, and there is only ever one.
