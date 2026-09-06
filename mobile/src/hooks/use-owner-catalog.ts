import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useMyShopId } from '@/hooks/use-my-shop';

export interface OwnerService {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  pricing_type: string;
  duration_minutes: number | null;
  is_active: boolean;
  rating_avg: number | null;
  rating_count: number;
  categories: { name: string } | null;
  pricing_rules: { id: string; condition: Record<string, string>; price: number }[] | null;
  addons: { id: string; name: string; price: number }[] | null;
}

const SERVICE_FIELDS =
  'id, name, description, base_price, pricing_type, duration_minutes, is_active, rating_avg, rating_count, ' +
  'categories(name), pricing_rules(id, condition, price), addons(id, name, price)';

export function useOwnerServices() {
  // Scoped to the shop being managed. The read policy on services is
  // deliberately permissive — a catalogue is public — so this filter, not RLS,
  // is what keeps another shop's rows out of this screen.
  const shopId = useMyShopId();

  return useQuery({
    queryKey: ['owner', 'services', shopId],
    enabled: Boolean(shopId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select(SERVICE_FIELDS)
        .eq('shop_id', shopId!)
        .order('name')
        .returns<OwnerService[]>();

      if (error) throw error;
      return data;
    },
  });
}

export function useOwnerService(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['owner', 'service', serviceId],
    enabled: Boolean(serviceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select(SERVICE_FIELDS)
        .eq('id', serviceId!)
        .single()
        .returns<OwnerService>();

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Taking a service off the menu, or putting it back.
 *
 * The single most useful thing to do from a phone: a machine breaks, the
 * service stops being bookable before the next customer picks it.
 */
export function useToggleService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('services')
        .update({ is_active: input.isActive })
        .eq('id', input.id)
        .select('id, is_active');

      if (error) throw error;
      // PostgREST answers 204 for a write that matched nothing, which reads as
      // success; the returned rows are what prove it landed.
      if (!data || data.length === 0) throw new Error('That service no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner'] });
      // The customer app reads the same catalogue.
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

/**
 * Saving an edited service.
 *
 * Only the fields the phone screen offers. Photos, category and add-on
 * structure are deliberately not writable here — sending columns the screen
 * never showed is how an edit quietly undoes someone else's work.
 */
export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      description: string | null;
      base_price: number;
      duration_minutes: number | null;
      is_active: boolean;
    }) => {
      const { id, ...patch } = input;

      const { data, error } = await supabase
        .from('services')
        .update(patch)
        .eq('id', id)
        .select('id');

      if (error) throw error;
      // PostgREST answers 204 for a write that matched nothing, which reads as
      // success; the returned rows are what prove it landed.
      if (!data || data.length === 0) throw new Error('That service no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner'] });
      // The customer app reads the same catalogue.
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

/** Changing what a tier costs. Prices move; the rest of a service rarely does. */
export function useUpdateTierPrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { ruleId: string; price: number }) => {
      if (!Number.isFinite(input.price) || input.price < 0) {
        throw new Error('Enter a price of zero or more.');
      }

      const { data, error } = await supabase
        .from('pricing_rules')
        .update({ price: input.price })
        .eq('id', input.ruleId)
        .select('id, price');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('That price tier no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export interface OwnerPromo {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_discount_amount: number | null;
  min_order_value: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  max_redemptions: number | null;
  per_customer_limit: number | null;
  applies_to: string;
  is_public: boolean;
}

/**
 * Every code, live or not.
 *
 * An admin sees all of them through promo_codes_select_public; a customer only
 * ever sees the advertised, in-window ones. Same query, different answer.
 */
export function useOwnerPromoCodes() {
  // Scoped to the shop being managed. The read policy on promo_codes is
  // deliberately permissive — a catalogue is public — so this filter, not RLS,
  // is what keeps another shop's rows out of this screen.
  const shopId = useMyShopId();

  return useQuery({
    queryKey: ['owner', 'promos', shopId],
    enabled: Boolean(shopId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promo_codes')
        .select(
          'id, code, description, discount_type, discount_value, max_discount_amount, min_order_value, ' +
            'starts_at, ends_at, is_active, max_redemptions, per_customer_limit, applies_to, is_public',
        )
        .eq('shop_id', shopId!)
        .order('created_at', { ascending: false })
        .returns<OwnerPromo[]>();

      if (error) throw error;
      return data;
    },
  });
}

export function useSavePromoCode() {
  const queryClient = useQueryClient();
  const shopId = useMyShopId();

  return useMutation({
    mutationFn: async (input: {
      id?: string | null;
      code: string;
      discountType: 'percentage' | 'fixed';
      discountValue: number;
      isPublic: boolean;
    }) => {
      if (!shopId) throw new Error('No shop selected.');
      // Stored upper-case so the unique index and the customer's typing agree.
      const row = {
        code: input.code.trim().toUpperCase(),
        discount_type: input.discountType,
        discount_value: input.discountValue,
        is_public: input.isPublic,
      };

      const query = input.id
        ? supabase.from('promo_codes').update(row).eq('id', input.id).select('id')
        // A promo code is a root row — no parent to take its shop from — so
        // the shop is stated here. Phase 2 made the code unique per shop rather
        // than globally, which is what lets two shops both run a SUMMER10.
        : supabase.from('promo_codes').insert({ ...row, shop_id: shopId }).select('id');

      const { data, error } = await query;

      if (error) {
        throw new Error(
          /duplicate|unique/i.test(error.message) ? 'That code already exists.' : error.message,
        );
      }
      if (!data || data.length === 0) throw new Error('That code no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'promos'] });
      queryClient.invalidateQueries({ queryKey: ['promo_codes'] });
    },
  });
}

export function useTogglePromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('promo_codes')
        .update({ is_active: input.isActive })
        .eq('id', input.id)
        .select('id, is_active');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('That code no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'promos'] });
      queryClient.invalidateQueries({ queryKey: ['promo_codes'] });
    },
  });
}

export function useDeletePromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('promo_codes').delete().eq('id', id).select('id');

      if (error) {
        // promo_redemptions references the code with ON DELETE RESTRICT: a code
        // someone actually used cannot be deleted, because that would erase the
        // record of a discount that was really given.
        throw new Error(
          /foreign key|violates/i.test(error.message)
            ? 'This code has been used, so it cannot be deleted. Pause it instead.'
            : error.message,
        );
      }
      if (!data || data.length === 0) throw new Error('That code no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'promos'] });
      queryClient.invalidateQueries({ queryKey: ['promo_codes'] });
    },
  });
}
