import { notFound } from 'next/navigation';

import { CategoryForm } from '@/components/categories/category-form';
import { createClient } from '@/lib/supabase/server';
import type { CategoryWithTemplate } from '@/types/database';

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from('categories')
    .select('*, input_templates(id, name, fields)')
    .eq('id', id)
    .returns<CategoryWithTemplate[]>()
    .maybeSingle();

  if (!category) {
    notFound();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit Category</h1>
      {/* The category's own shop, not whichever one is selected: editing a
          category can still insert an input template, and that template
          belongs beside the category rather than wherever the admin is. */}
      <CategoryForm
        category={category}
        inputTemplate={category.input_templates ?? undefined}
        shopId={category.shop_id}
      />
    </div>
  );
}
