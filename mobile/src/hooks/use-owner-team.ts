import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { TECHNICIAN_FIELDS, type OwnerTechnician } from '@/hooks/use-owner';
import { useMyShopId } from '@/hooks/use-my-shop';

/**
 * The whole team, including anyone stood down.
 *
 * Distinct from useTechnicians, which returns only the active ones because it
 * feeds the assign sheet. This screen manages people, so it has to show the
 * inactive ones too — otherwise they are unreachable once stood down.
 */
export function useTeam() {
  // Scoped to the shop being managed. The read policy on technicians is
  // deliberately permissive — a catalogue is public — so this filter, not RLS,
  // is what keeps another shop's rows out of this screen.
  const shopId = useMyShopId();

  return useQuery({
    queryKey: ['owner', 'team', shopId],
    enabled: Boolean(shopId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('technicians')
        .select(TECHNICIAN_FIELDS)
        .eq('shop_id', shopId!)
        .order('status')
        .order('name')
        .returns<OwnerTechnician[]>();

      if (error) throw error;
      return data;
    },
  });
}

export function useSaveTechnician() {
  const queryClient = useQueryClient();
  const shopId = useMyShopId();

  return useMutation({
    mutationFn: async (input: { id?: string | null; name: string; phone: string }) => {
      if (!shopId) throw new Error('No shop selected.');
      const row = {
        name: input.name.trim(),
        phone: input.phone.trim() || null,
      };

      const query = input.id
        ? supabase.from('technicians').update(row).eq('id', input.id).select('id')
        : // shop_id is NOT NULL with nothing to derive it from, so it is sent on
          // insert. It is deliberately absent from the update: a technician does
          // not move between shops by being renamed.
          supabase.from('technicians').insert({ ...row, shop_id: shopId }).select('id');

      const { data, error } = await query;

      if (error) throw error;
      // PostgREST answers 204 for a write that matched nothing, which reads as
      // success; the returned rows are what prove it landed.
      if (!data || data.length === 0) throw new Error('That technician no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner'] });
    },
  });
}

/**
 * Standing someone down, or bringing them back.
 *
 * Preferred over deleting: bookings.technician_id is ON DELETE SET NULL, so a
 * delete would silently strip the technician off every job they ever did,
 * including finished ones — the history would say nobody worked them. Setting
 * `inactive` takes them out of the assign sheet and leaves the record intact.
 */
export function useSetTechnicianStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; status: 'active' | 'inactive' }) => {
      const { data, error } = await supabase
        .from('technicians')
        .update({ status: input.status })
        .eq('id', input.id)
        .select('id, status');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('That technician no longer exists.');
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner'] });
    },
  });
}
