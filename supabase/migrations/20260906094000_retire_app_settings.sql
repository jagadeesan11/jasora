-- app_settings is retired.
--
-- Nothing reads it any more: both clients read shops, and the last function
-- that did — choose_cash_on_delivery — was moved in the previous migration.
-- Verified against the live catalogue rather than by reading migration files.
--
-- BUT IT IS NOT SIMPLY DROPPED.
--
-- Builds of the mobile app already installed still query app_settings by name.
-- Dropping the table would not crash them — useAppSettings falls back to a
-- hardcoded shop name and support address — but every one of those installs
-- would quietly start showing the wrong shop name, wrong phone number and no
-- logo until its owner happened to update. A schema change should not degrade
-- software that is already out.
--
-- So the table becomes a view over the shop it described. Old installs keep
-- working, and keep reading live values rather than a copy frozen on the day
-- the columns moved. New installs never touch it.
--
-- The view can only answer for one shop, because the app asking has no concept
-- of a second one. It returns the oldest active shop, which is the original
-- one for as long as this matters. That is the whole reason it is temporary:
-- once the current build is superseded, drop the view.

drop table if exists public.app_settings;

create view public.app_settings
with (security_invoker = true)
as
  select
    true                    as id,
    s.name                  as shop_name,
    s.logo_url              as shop_logo_url,
    s.support_email,
    s.support_phone,
    s.address_line          as shop_address_line,
    s.city                  as shop_city,
    s.postal_code           as shop_postal_code,
    s.cod_enabled,
    s.online_payment_enabled,
    s.privacy_url,
    s.terms_url,
    s.instagram_url,
    s.whatsapp_number,
    s.updated_at
  from public.shops s
  where s.is_active
  order by s.created_at
  limit 1;

comment on view public.app_settings is
  'Compatibility shim for mobile builds released before multi-tenancy. Reads the oldest active shop under the old column names. Drop once those builds are gone — nothing in this repository reads it.';

-- security_invoker so the caller''s own permissions apply rather than the
-- view owner''s. shops is readable by anon and authenticated, which is what the
-- sign-in screen needs, and the view inherits exactly that rather than
-- widening it.
grant select on public.app_settings to anon, authenticated;
