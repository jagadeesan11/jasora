import { useQuery } from '@tanstack/react-query';

import type { BusyInterval } from '@/lib/scheduling';
import { supabase } from '@/lib/supabase';

/**
 * When a shop is already occupied, over the week the picker offers.
 *
 * Goes through an RPC rather than reading bookings, because a customer cannot
 * see other people's bookings and should not be able to: the function answers
 * only with times, never with who or what.
 *
 * This is the picker's convenience, not the rule. create_booking refuses an
 * overbooked slot regardless — two customers tapping at the same instant can
 * only be settled where the write happens — so a stale answer here costs
 * somebody a second attempt rather than producing a double booking.
 */
export function useShopBusy(shopId: string | null | undefined, days = 7) {
  return useQuery({
    queryKey: ['shop_busy', shopId, days],
    enabled: Boolean(shopId),
    // Short: a slot taken while someone is filling in the form should show as
    // taken by the time they reach the picker again.
    staleTime: 30 * 1000,
    queryFn: async () => {
      const from = new Date();
      const to = new Date(from);
      to.setDate(to.getDate() + days);

      const { data, error } = await supabase.rpc('shop_busy_intervals', {
        p_shop: shopId,
        // The window starts now, but a job that began days ago and is still
        // running is returned too — the function compares against the end of
        // each booking, not its start.
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      return (data ?? []) as BusyInterval[];
    },
  });
}
