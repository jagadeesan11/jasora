import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { ShopMembers, type MemberRow } from '@/components/shops/shop-members';
import { createClient } from '@/lib/supabase/server';
import type { AppUser } from '@/types/database';

export default async function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shop }, { data: members }, { data: profiles }] = await Promise.all([
    supabase
      .from('shops')
      .select('id, name, slug, city, invoice_prefix, is_active')
      .eq('id', id)
      .maybeSingle<{
        id: string;
        name: string;
        slug: string;
        city: string | null;
        invoice_prefix: string;
        is_active: boolean;
      }>(),
    supabase
      .from('shop_members')
      .select('profile_id, role, profiles(id, name, email, phone, role)')
      .eq('shop_id', id)
      .returns<MemberRow[]>(),
    // Candidates to add. Customers are included deliberately: taking someone on
    // is how a person becomes staff, and requiring their profile role to be
    // changed under Users first would make adding the first owner of a new shop
    // a two-screen job with no clue that the other screen exists.
    supabase
      .from('profiles')
      .select('id, name, email, phone, role')
      .order('name')
      .returns<AppUser[]>(),
  ]);

  if (!shop) notFound();

  return (
    <div>
      <PageHeader
        title={shop.name}
        description={`/${shop.slug} · bills numbered ${shop.invoice_prefix}/2026-27/0001${shop.is_active ? '' : ' · switched off'}`}
      />

      <ShopMembers
        shopId={shop.id}
        shopName={shop.name}
        members={members ?? []}
        candidates={profiles ?? []}
      />

      {/* Said plainly rather than left to be discovered. This page is only
          staff; the shop's logo, address, payment methods and legal links are
          the same form every shop uses, which edits whichever shop is selected.
          The web address and invoice prefix are deliberately not editable
          anywhere: both are referenced by things already issued — file paths
          and printed bills — and changing them breaks those after the fact. */}
      <p className="mt-8 max-w-2xl text-xs text-muted-foreground">
        Logo, address, payment methods and legal links live under Settings. Switch to this shop
        from the Shops list first, then open Settings. The web address and invoice prefix cannot be
        changed once a shop exists, because links and printed bills already carry them.
      </p>
    </div>
  );
}
