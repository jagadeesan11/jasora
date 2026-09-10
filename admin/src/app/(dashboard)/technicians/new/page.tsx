import { TechnicianForm } from '@/components/technicians/technician-form';
import { requireShopId } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { Category } from '@/types/database';

export default async function NewTechnicianPage() {
  const supabase = await createClient();
  const shopId = await requireShopId();
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, icon, input_template_id')
    .eq('shop_id', shopId)
    .order('name')
    .returns<Category[]>();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New Technician</h1>
      <TechnicianForm categories={categories ?? []} shopId={shopId} />
    </div>
  );
}
