import { CategoryForm } from '@/components/categories/category-form';
import { requireShopId } from '@/lib/shop';

export default async function NewCategoryPage() {
  // A new row belongs to the shop currently being worked in.
  const shopId = await requireShopId();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New Category</h1>
      <CategoryForm shopId={shopId} />
    </div>
  );
}
