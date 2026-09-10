import { ServiceForm } from '@/components/services/service-form';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { Category } from '@/types/database';

export default async function NewServicePage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();

  // A service is created under one of this shop's categories, so only this
  // shop's categories are offered.
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('shop_id', shop?.id ?? '')
    .order('name')
    .returns<Category[]>();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New Service</h1>
      <ServiceForm categories={categories ?? []} />
    </div>
  );
}
