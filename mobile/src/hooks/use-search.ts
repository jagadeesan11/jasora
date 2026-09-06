import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * Searching shops and services, across every shop.
 *
 * Deliberately not scoped to the currently selected shop. Someone typing
 * "ceramic coating" is asking who does it, not whether the shop they happen to
 * be looking at does — and with several shops on the platform, a search that
 * only saw one of them would quietly hide most of the answer. Picking a result
 * is what settles the shop, not the other way round.
 */

export interface ShopHit {
  kind: 'shop';
  id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
}

export interface ServiceHit {
  kind: 'service';
  id: string;
  name: string;
  base_price: number;
  icon: string | null;
  shop_id: string;
  shopName: string;
}

export type SearchHit = ShopHit | ServiceHit;

interface ServiceRow {
  id: string;
  name: string;
  base_price: number;
  icon: string | null;
  shop_id: string;
  shops: { name: string } | null;
}

/** PostgREST treats these as pattern syntax, so they cannot reach a filter raw. */
function escapePattern(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export function useSearch(rawQuery: string) {
  const query = rawQuery.trim();
  // Two characters, because one matches most of the catalogue and the results
  // are noise rather than an answer.
  const enabled = query.length >= 2;

  return useQuery({
    queryKey: ['search', query],
    enabled,
    // Long enough that typing does not refetch the same term repeatedly.
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SearchHit[]> => {
      const pattern = `%${escapePattern(query)}%`;

      const [shops, services] = await Promise.all([
        supabase
          .from('shops')
          .select('id, name, city, logo_url')
          .eq('is_active', true)
          .or(`name.ilike.${pattern},city.ilike.${pattern}`)
          .order('name')
          .limit(10)
          .returns<Omit<ShopHit, 'kind'>[]>(),
        supabase
          .from('services')
          .select('id, name, base_price, icon, shop_id, shops(name)')
          .eq('is_active', true)
          // Description as well as name: a service called "Ceramic Coating"
          // and one called "Paint Protection" that mentions ceramic in its
          // description are both answers to the same question.
          .or(`name.ilike.${pattern},description.ilike.${pattern}`)
          .order('name')
          .limit(25)
          .returns<ServiceRow[]>(),
      ]);

      if (shops.error) throw shops.error;
      if (services.error) throw services.error;

      // Shops first: with several on the platform, "who does this" is usually
      // the question behind the search, and a shop is a shorter answer than
      // twenty of its services.
      return [
        ...(shops.data ?? []).map((s): ShopHit => ({ kind: 'shop', ...s })),
        ...(services.data ?? []).map(
          (s): ServiceHit => ({
            kind: 'service',
            id: s.id,
            name: s.name,
            base_price: s.base_price,
            icon: s.icon,
            shop_id: s.shop_id,
            shopName: s.shops?.name ?? '',
          }),
        ),
      ];
    },
  });
}
