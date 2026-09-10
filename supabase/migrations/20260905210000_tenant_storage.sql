-- Phase 7 of multi-tenancy: storage writes become the shop's own.
--
-- Both buckets are public and shared, and both write policies say
-- `private.is_admin()` — tenant blind. Any shop's owner can today overwrite
-- any other shop's logo or service photograph, at a stable public URL, with no
-- trace beyond the object itself.
--
-- NO FILES ARE MOVED.
--
-- The obvious design is to prefix every object with its shop id, but that
-- means rewriting live URLs, and two of them are load-bearing outside this
-- system: shops.privacy_url and terms_url point at PDFs in legal-docs, and a
-- privacy policy URL is what an app store fetches during review. Breaking
-- those to tidy a path is a bad trade.
--
-- Two things make the move unnecessary:
--
--   * service-images is already foldered by service id — verified against the
--     live bucket, every folder name matches its service's primary key. The
--     owning shop is therefore derivable by joining services, and derived
--     ownership cannot drift from the truth the way a copied prefix can.
--   * anything else may live under the shop's own id.
--
-- So a write is allowed when the first path segment is either a service this
-- shop owns, or the shop's own id. Existing objects at the bucket root — the
-- two legal PDFs and the current brand/ logo — match neither and stay
-- platform-admin-only, which is what they were in practice anyway.

-- service-images ---------------------------------------------------------------

drop policy "service_images_admin_write" on storage.objects;

create policy "service_images_shop_write" on storage.objects
  for all
  using (
    bucket_id = 'service-images'
    and (
      private.is_platform_admin()
      -- Photographs, under the service they belong to.
      or exists (
        select 1 from public.services s
        where s.id::text = (storage.foldername(name))[1]
          and s.shop_id in (select private.my_admin_shop_ids())
      )
      -- Brand assets, under the shop itself. Compared as text so a folder that
      -- is not a uuid fails the test rather than raising: a cast error inside a
      -- policy is an error, not a denial, and would surface as a broken upload
      -- instead of a refused one.
      or (storage.foldername(name))[1] in (
        select s::text from private.my_admin_shop_ids() s
      )
    )
  )
  with check (
    bucket_id = 'service-images'
    and (
      private.is_platform_admin()
      or exists (
        select 1 from public.services s
        where s.id::text = (storage.foldername(name))[1]
          and s.shop_id in (select private.my_admin_shop_ids())
      )
      or (storage.foldername(name))[1] in (
        select s::text from private.my_admin_shop_ids() s
      )
    )
  );

-- legal-docs -------------------------------------------------------------------
--
-- Same rule, minus the service branch: a shop's documents live under its id.
-- The two PDFs already at the root keep their URLs and stay platform-admin
-- only, so nothing an app store has already been given stops resolving.

drop policy "legal_docs_admin_write" on storage.objects;

create policy "legal_docs_shop_write" on storage.objects
  for all
  using (
    bucket_id = 'legal-docs'
    and (
      private.is_platform_admin()
      or (storage.foldername(name))[1] in (
        select s::text from private.my_admin_shop_ids() s
      )
    )
  )
  with check (
    bucket_id = 'legal-docs'
    and (
      private.is_platform_admin()
      or (storage.foldername(name))[1] in (
        select s::text from private.my_admin_shop_ids() s
      )
    )
  );

-- Reads are unchanged and stay public on both buckets. A shop-front catalogue
-- is meant to be browsable before anyone signs in, and a privacy policy has to
-- be readable by a reviewer who has no account at all.
