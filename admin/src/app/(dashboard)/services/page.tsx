import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { getCurrentRole } from '@/lib/auth';

import { buttonVariants } from '@/components/ui/button';
import { ServicesTable } from '@/components/services/services-table';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { ServiceWithCategory } from '@/types/database';

export default async function ServicesPage() {
  const supabase = await createClient();
  const isAdmin = (await getCurrentRole())?.role === 'admin';
  const { shop } = await getShopContext();
  const { data, error } = await supabase
    .from('services')
    .select('id, category_id, name, base_price, pricing_type, is_active, categories(id, name)')
    .eq('shop_id', shop?.id ?? '')
    .order('created_at', { ascending: false })
    .returns<ServiceWithCategory[]>();

  return (
    <div>
      <PageHeader
        title="Services"
        description="Manage the services offered under each category."
        // Admin-only, same as adding a category. Editing and retiring an
        // existing service stay open to a shop owner.
        action={
          isAdmin ? (
            <Link href="/services/new" className={buttonVariants()}>
              New Service
            </Link>
          ) : null
        }
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load services: {error.message}</p>
      ) : (
        <ServicesTable initialServices={data ?? []} />
      )}
    </div>
  );
}
