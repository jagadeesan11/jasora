-- Phase 7, corrected: the storage policy stops joining and starts asking.
--
-- The first version allowed a write when the path's first segment was a
-- service belonging to one of the caller's shops, expressed as a subquery over
-- public.services inside the policy. Tested through a real session, that branch
-- refused a shop owner uploading to their own service's folder, while the
-- sibling branch — a plain set-membership test on my_admin_shop_ids() — worked
-- from the same session. Evaluated as postgres the predicate returned true, so
-- the logic was right and something about running it as `authenticated` inside
-- a storage policy was not.
--
-- Rather than keep chasing that, the join goes away. A SECURITY DEFINER
-- set-returning helper answers "which services are mine", the policy does a
-- membership test against it, and both branches are then the same shape as
-- every policy phase 4 wrote. It is also faster: a set-returning helper with no
-- arguments is hoisted into an InitPlan and evaluated once per statement,
-- whereas the subquery ran per row.

create or replace function private.my_service_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.id from public.services s
   where s.shop_id in (select private.my_admin_shop_ids());
$$;

comment on function private.my_service_ids is
  'Services belonging to shops the caller owns. For storage policies, where objects are foldered by service id.';

drop policy "service_images_shop_write" on storage.objects;

create policy "service_images_shop_write" on storage.objects
  for all
  using (
    bucket_id = 'service-images'
    and (
      private.is_platform_admin()
      -- Photographs, foldered by the service they belong to.
      or (storage.foldername(name))[1] in (select s::text from private.my_service_ids() s)
      -- Brand assets, foldered by the shop itself.
      or (storage.foldername(name))[1] in (select s::text from private.my_admin_shop_ids() s)
    )
  )
  with check (
    bucket_id = 'service-images'
    and (
      private.is_platform_admin()
      or (storage.foldername(name))[1] in (select s::text from private.my_service_ids() s)
      or (storage.foldername(name))[1] in (select s::text from private.my_admin_shop_ids() s)
    )
  );

-- Compared as text throughout. Casting the folder name to uuid would raise on
-- any path that is not one — the two legal PDFs at a bucket root, say — and an
-- error inside a policy is an error, not a denial: the caller would see a
-- broken upload instead of a refused one.
