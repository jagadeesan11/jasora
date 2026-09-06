import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { getCurrentRole } from '@/lib/auth';

import { buttonVariants } from '@/components/ui/button';
import { CategoriesTable } from '@/components/categories/categories-table';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { CategoryWithTemplate } from '@/types/database';

export default async function CategoriesPage() {
  const supabase = await createClient();
  const isAdmin = (await getCurrentRole())?.role === 'admin';
  const { shop } = await getShopContext();

  // Scoped to the shop being worked in. The read policies on the catalogue
  // tables are deliberately open — a shop front is public — so these filters,
  // not RLS, are what keep one shop's rows off another shop's screen.
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, icon, input_template_id, input_templates(id, fields)')
    .eq('shop_id', shop?.id ?? '')
    .order('name')
    .returns<CategoryWithTemplate[]>();

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Each category defines what info a booking needs to collect (its input template)."
        // Deciding what the business sells is an admin's call, so a shop owner
        // is not offered the button. The route and the RLS policy behind it
        // enforce that independently — this only avoids dangling a control
        // that would fail.
        action={
          isAdmin ? (
            <Link href="/categories/new" className={buttonVariants()}>
              New Category
            </Link>
          ) : null
        }
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load categories: {error.message}</p>
      ) : (
        <CategoriesTable initialCategories={data ?? []} />
      )}
    </div>
  );
}
