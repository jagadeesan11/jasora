import { PageHeader } from '@/components/page-header';
import { PromoCodesManager } from '@/components/promo-codes/promo-codes-manager';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { PromoCode, PromoCodeWithUsage } from '@/types/promo';

export default async function PromoCodesPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();
  const shopId = shop?.id ?? '';

  const [{ data: codes, error }, { data: redemptions }, { data: categories }, { data: services }] =
    await Promise.all([
      supabase
        .from('promo_codes')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .returns<PromoCode[]>(),
      supabase
        .from('promo_redemptions')
        .select('promo_code_id, amount_discounted, released_at')
        .returns<{ promo_code_id: string; amount_discounted: number; released_at: string | null }[]>(),
      // The pickers a code can be restricted to. Same shop, or a code could be
      // scoped to a category it can never apply to.
      supabase.from('categories').select('id, name').eq('shop_id', shopId).order('name'),
      supabase.from('services').select('id, name').eq('shop_id', shopId).order('name'),
    ]);

  // Aggregated here rather than in SQL: PostgREST has no GROUP BY, and at this
  // volume one pass over the rows costs nothing.
  //
  // Released redemptions are excluded from the count — they no longer hold a
  // slot — but their value still counts as discount given, because the money
  // was genuinely taken off a booking that then got cancelled.
  const usage = new Map<string, { redeemed: number; discounted_total: number }>();
  for (const r of redemptions ?? []) {
    const row = usage.get(r.promo_code_id) ?? { redeemed: 0, discounted_total: 0 };
    if (!r.released_at) row.redeemed += 1;
    row.discounted_total += Number(r.amount_discounted);
    usage.set(r.promo_code_id, row);
  }

  const withUsage: PromoCodeWithUsage[] = (codes ?? []).map((c) => ({
    ...c,
    redeemed: usage.get(c.id)?.redeemed ?? 0,
    discounted_total: usage.get(c.id)?.discounted_total ?? 0,
  }));

  const live = withUsage.filter(
    (c) =>
      c.is_active &&
      (!c.starts_at || new Date(c.starts_at) <= new Date()) &&
      (!c.ends_at || new Date(c.ends_at) >= new Date()),
  ).length;

  return (
    <div>
      <PageHeader
        title="Promo codes"
        description={
          withUsage.length === 0
            ? 'Codes customers can apply before paying. Percentage or fixed, limited by date, usage or which services they cover.'
            : `${live} live of ${withUsage.length}. Customers apply these before paying; the discount is checked again at booking, so an expired code never slips through.`
        }
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load promo codes: {error.message}</p>
      ) : (
        <PromoCodesManager
          initialCodes={withUsage}
          categories={categories ?? []}
          services={services ?? []}
        />
      )}
    </div>
  );
}
