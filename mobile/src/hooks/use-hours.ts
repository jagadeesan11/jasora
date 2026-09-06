import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { BusinessHours, ShopClosure } from '@/lib/scheduling';

/**
 * Opening hours and blocked days, for one shop.
 *
 * Readable without a session, like the shop name and address, because the slot
 * picker needs them before anyone signs in.
 *
 * The shop is a parameter rather than something these hooks work out for
 * themselves, because the right answer differs by caller: a customer wants the
 * shop they are booking with, an owner wants the shop they are managing, and
 * for anyone who is both those are not necessarily the same shop. Passing null
 * holds the query until the caller knows — it must never mean "all shops",
 * which before multi-tenancy is exactly what an unfiltered query meant.
 */
export function useBusinessHours(shopId: string | null | undefined) {
  return useQuery({
    queryKey: ['business_hours', shopId],
    enabled: Boolean(shopId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_hours')
        .select('weekday, is_open, opens_at, closes_at')
        .eq('shop_id', shopId!)
        .order('weekday')
        .returns<BusinessHours[]>();

      if (error) throw error;
      return data;
    },
  });
}

export interface ClosureRow extends ShopClosure {
  id: string;
  reason: string | null;
}

export function useShopClosures(shopId: string | null | undefined) {
  return useQuery({
    queryKey: ['shop_closures', shopId],
    enabled: Boolean(shopId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Only from today: a day the shop was shut last month tells a customer
      // nothing and would clutter the owner's list forever.
      const today = new Date();
      const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

      const { data, error } = await supabase
        .from('shop_closures')
        .select('id, closed_on, reason')
        .eq('shop_id', shopId!)
        .gte('closed_on', iso)
        .order('closed_on')
        .returns<ClosureRow[]>();

      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateHours(shopId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { weekday: number; is_open?: boolean; opens_at?: string; closes_at?: string }) => {
      if (!shopId) throw new Error('No shop selected.');
      const { weekday, ...patch } = input;
      // Filtered by shop as well as weekday. The write policy would refuse
      // another shop's row, but someone who owns two shops passes that check
      // for both — without this filter, editing Monday would edit Monday
      // everywhere they work.
      const { data, error } = await supabase
        .from('business_hours')
        .update(patch)
        .eq('shop_id', shopId)
        .eq('weekday', weekday)
        .select('weekday');

      if (error) throw error;
      // PostgREST answers 204 for a write that matched nothing, which reads as
      // success; the returned rows are what prove it landed.
      if (!data || data.length === 0) throw new Error('Those hours could not be saved.');
      return data[0];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business_hours'] }),
  });
}

export function useAddClosure(shopId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { closedOn: string; reason: string }) => {
      // shop_id is NOT NULL with no default and nothing to derive it from, so
      // it is sent explicitly. Without it the insert fails at the constraint.
      if (!shopId) throw new Error('No shop selected.');
      const { data, error } = await supabase
        .from('shop_closures')
        .insert({ shop_id: shopId, closed_on: input.closedOn, reason: input.reason.trim() || null })
        .select('id');

      if (error) {
        throw new Error(
          /duplicate|unique/i.test(error.message) ? 'That day is already blocked.' : error.message,
        );
      }
      return data[0];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop_closures'] }),
  });
}

export function useRemoveClosure() {
  const queryClient = useQueryClient();

  return useMutation({
    // By primary key, so it needs no shop filter: the id names one row, and the
    // write policy already refuses one belonging to a shop this person does not
    // run.
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('shop_closures').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('That day is no longer blocked.');
      return data[0];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop_closures'] }),
  });
}
