import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { InputTemplateField } from '@/types';

interface CategoryInputTemplateRow {
  category_id: string;
  categories: {
    id: string;
    input_template_id: string | null;
    input_templates: { fields: InputTemplateField[] } | null;
  } | null;
}

/** Resolves service -> category -> input_template.fields in one round trip. */
export function useCategoryInputTemplate(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['services', 'category-input-template', serviceId],
    enabled: Boolean(serviceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('category_id, categories(id, input_template_id, input_templates(fields))')
        .eq('id', serviceId!)
        .single()
        .returns<CategoryInputTemplateRow>();

      if (error) throw error;
      return {
        categoryId: data.category_id,
        fields: data.categories?.input_templates?.fields ?? [],
      };
    },
  });
}

export function useCreateCustomerAsset() {
  return useMutation({
    mutationFn: async (input: { userId: string; type: string; attributes: Record<string, string> }) => {
      const { data, error } = await supabase
        .from('customer_assets')
        .insert({ user_id: input.userId, type: input.type, attributes: input.attributes })
        .select('id, attributes')
        .single();

      if (error) throw error;
      return data;
    },
  });
}

export function useCustomerAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: ['customer_assets', assetId],
    enabled: Boolean(assetId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_assets')
        .select('id, attributes')
        .eq('id', assetId!)
        .single();

      if (error) throw error;
      return data as { id: string; attributes: Record<string, string> };
    },
  });
}

/**
 * Creates a booking through the create_booking RPC.
 *
 * Not a direct insert any more: customers no longer hold INSERT on bookings.
 * The price is computed in the database from the service, its pricing rules
 * and the chosen add-ons, so neither the total nor the owning user is
 * something this app can assert — it can only ask.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      serviceId: string;
      assetId: string | null;
      addonIds: string[];
      scheduledAt: Date;
      contactName?: string | null;
      contactPhone?: string | null;
      serviceAddress?: string | null;
      serviceCity?: string | null;
      servicePostalCode?: string | null;
      needsPickup?: boolean;
      pickupNotes?: string | null;
      /** Checked again server-side; an expired code fails the booking. */
      promoCode?: string | null;
    }) => {
      // The function returns `public.bookings`, a composite type, so PostgREST
      // answers with a single object — no .single() and no array to unwrap.
      const { data, error } = await supabase.rpc('create_booking', {
        p_service_id: input.serviceId,
        p_scheduled_at: input.scheduledAt.toISOString(),
        p_asset_id: input.assetId,
        p_addon_ids: input.addonIds,
        p_contact_name: input.contactName ?? null,
        p_contact_phone: input.contactPhone ?? null,
        p_service_address: input.serviceAddress ?? null,
        p_service_city: input.serviceCity ?? null,
        p_service_postal_code: input.servicePostalCode ?? null,
        p_needs_pickup: input.needsPickup ?? false,
        p_pickup_notes: input.pickupNotes || null,
        p_promo_code: input.promoCode || null,
      });

      if (error) throw error;
      return data as BookingListItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export interface BookingListItem {
  id: string;
  scheduled_at: string;
  status: string;
  total_price: number;
  discount_amount: number;
  discount_reason: string | null;
  promo_discount_amount: number;
  promo_codes: { code: string } | null;
  /** Generated: total_price - discount_amount - promo_discount_amount, floored at 0. */
  net_price: number;
  services: { name: string } | null;
  technicians: { name: string } | null;
  /** Which shop the job is with. A customer books across shops now, so the
   *  service name alone no longer says who is doing the work. */
  shops: { name: string } | null;
}

/**
 * The signed-in customer's own bookings.
 *
 * The user id is part of the key even though RLS already scopes the rows:
 * without it the cache entry outlives a sign-out, and the next person to sign
 * in on the same device sees the previous customer's bookings until the
 * refetch lands.
 */
export function useMyBookings(userId?: string) {
  return useQuery({
    queryKey: ['bookings', 'mine', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, scheduled_at, status, total_price, discount_amount, discount_reason, promo_discount_amount, net_price, promo_codes(code), services(name), technicians(name), shops(name)')
        .order('scheduled_at', { ascending: false })
        .returns<BookingListItem[]>();

      if (error) throw error;
      return data;
    },
  });
}

export interface BookingDetail extends BookingListItem {
  created_at: string;
  addon_ids: string[];
  service_id: string;
  services: { name: string; duration_minutes: number | null } | null;
}

export function useBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['bookings', 'detail', bookingId],
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, created_at, scheduled_at, status, total_price, discount_amount, discount_reason, promo_discount_amount, net_price, promo_codes(code), addon_ids, service_id, services(name, duration_minutes), technicians(name), shops(name)',
        )
        .eq('id', bookingId!)
        .single()
        .returns<BookingDetail>();

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Customer-initiated cancellation.
 *
 * Writes the status directly: this is the one transition the database lets a
 * customer make, and it refuses the rest, so no privileged path is needed.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
