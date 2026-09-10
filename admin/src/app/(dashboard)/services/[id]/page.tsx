import { notFound } from 'next/navigation';

import { ServiceForm } from '@/components/services/service-form';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { Addon, Category, PricingRule, Service } from '@/types/database';

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { shop } = await getShopContext();

  const [{ data: service }, { data: categories }, { data: pricingRules }, { data: addons }] =
    await Promise.all([
      supabase.from('services').select('*').eq('id', id).returns<Service[]>().maybeSingle(),
      supabase
        .from('categories')
        .select('id, name, slug')
        // This shop's categories only. A service can be moved between
        // categories here, and phase 2's composite key would refuse a move to
        // another shop's category anyway — better not to offer it.
        .eq('shop_id', shop?.id ?? '')
        .order('name')
        .returns<Category[]>(),
      supabase
        .from('pricing_rules')
        .select('*')
        .eq('service_id', id)
        .returns<PricingRule[]>(),
      supabase.from('addons').select('*').eq('service_id', id).returns<Addon[]>(),
    ]);

  if (!service) {
    notFound();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit Service</h1>
      <ServiceForm
        categories={categories ?? []}
        service={service}
        pricingRules={pricingRules ?? []}
        addons={addons ?? []}
      />
    </div>
  );
}
