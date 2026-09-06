import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { PlatformLegalCard } from '@/components/shops/platform-legal-card';
import { ShopsTable, type ShopRow } from '@/components/shops/shops-table';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getShopContext } from '@/lib/shop';

export default async function ShopsPage() {
  const supabase = await createClient();
  const { shop: current } = await getShopContext();

  // Staff count comes back as an aggregate on the embed rather than a second
  // query, because the one thing this list has to make obvious is a shop with
  // nobody on it: every owner-side policy is written against shop_members, so
  // until someone is added the shop cannot be run by anyone but a platform
  // admin, and nothing else on screen would say so.
  // The platform's own legal documents, which every shop falls back to.
  const { data: platform } = await supabase
    .from('platform_settings')
    .select('privacy_url, terms_url')
    .maybeSingle<{ privacy_url: string | null; terms_url: string | null }>();

  const { data, error } = await supabase
    .from('shops')
    .select('id, slug, name, city, invoice_prefix, is_active, shop_members(count)')
    .order('name')
    .returns<ShopRow[]>();

  return (
    <div>
      <PageHeader
        title="Shops"
        description="Every business running on Nexora. Each one has its own catalogue, staff, hours and invoice numbers."
        action={
          <Link href="/shops/new" className={buttonVariants()}>
            New shop
          </Link>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load shops: {error.message}</p>
      ) : (
        <ShopsTable shops={data ?? []} currentShopId={current?.id ?? null} />
      )}

      <PlatformLegalCard
        privacyUrl={platform?.privacy_url ?? null}
        termsUrl={platform?.terms_url ?? null}
      />
    </div>
  );
}
