import { useQuery } from '@tanstack/react-query';

import { useAppSettings } from '@/hooks/use-app-settings';
import { supabase } from '@/lib/supabase';
import type { Category, Service, ServiceWithPricing } from '@/types';

/**
 * What this shop sells.
 *
 * Scoped to the current shop. Catalogue rows stay readable to everyone by
 * policy — a shop front is meant to be browsable before anyone signs in — so
 * nothing but this filter stops ten shops' categories arriving as one list.
 * The shop comes from the hook rather than the caller because there is only
 * one right answer for a customer: the shop they are booking with.
 */
export function useCategories() {
  const { shopId } = useAppSettings();

  return useQuery({
    queryKey: ['categories', shopId],
    enabled: Boolean(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('shop_id', shopId!)
        .order('name')
        .returns<Category[]>();

      if (error) throw error;
      return data;
    },
  });
}

// Not filtered by shop: a category belongs to exactly one, and phase 2's
// composite foreign key makes a service under another shop's category
// unrepresentable, so the category id already names the shop.
export function useServicesByCategory(categoryId: string | undefined) {
  return useQuery({
    queryKey: ['services', 'by-category', categoryId],
    enabled: Boolean(categoryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('category_id', categoryId!)
        .eq('is_active', true)
        .order('name')
        .returns<Service[]>();

      if (error) throw error;
      return data;
    },
  });
}

export function useServiceDetail(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['services', 'detail', serviceId],
    enabled: Boolean(serviceId),
    queryFn: async () => {
      const [serviceResult, pricingRulesResult, addonsResult] = await Promise.all([
        supabase.from('services').select('*').eq('id', serviceId!).single().returns<Service>(),
        supabase.from('pricing_rules').select('*').eq('service_id', serviceId!),
        supabase.from('addons').select('*').eq('service_id', serviceId!),
      ]);

      if (serviceResult.error) throw serviceResult.error;
      if (pricingRulesResult.error) throw pricingRulesResult.error;
      if (addonsResult.error) throw addonsResult.error;

      return {
        ...serviceResult.data,
        pricing_rules: pricingRulesResult.data,
        addons: addonsResult.data,
      } as ServiceWithPricing;
    },
  });
}
