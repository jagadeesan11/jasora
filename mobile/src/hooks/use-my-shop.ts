import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { resolveShop, type ShopRow } from '@/lib/current-shop';
import { createShopChoice } from '@/lib/shop-choice';
import { supabase } from '@/lib/supabase';

/**
 * The shops the signed-in person actually works at.
 *
 * Distinct from useShops(), which lists every shop a customer could book with.
 * The owner app must never offer a shop this person is not a member of: the
 * write policies would refuse it anyway, but discovering that by way of a
 * failed save is a poor way to learn it.
 *
 * The membership row is also where the owner-side shop_id for new rows comes
 * from — categories, technicians, promo codes and blocked days have no parent
 * to derive it from, so somebody has to say which shop they belong to, and
 * this is the only source that cannot be wrong.
 */

// Its own store, separate from the customer's: the shop someone books with
// says nothing about the shop they manage.
const useOwnerChosenShopId = createShopChoice('jasora.owner_shop_id');

// One list, used by both branches, so a column added for one cannot go missing
// from the other.
const SHOP_COLUMNS =
  'id, slug, name, logo_url, support_email, support_phone, address_line, city, postal_code, ' +
  'cod_enabled, online_payment_enabled, privacy_url, terms_url, instagram_url, whatsapp_number, is_active, ' +
  'latitude, longitude, service_radius_km, concurrent_jobs';

interface MembershipRow {
  role: string;
  shops: ShopRow;
}

export function useMyShops() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  // A platform admin administers every shop and is a member of none — that is
  // how phase 3 defined the tier, so a membership query returns nothing for
  // them and the owner app would come up empty. They read shops directly
  // instead, the same as the web panel does.
  const isPlatformAdmin = profile?.role === 'admin';

  return useQuery({
    queryKey: ['my_shops', isPlatformAdmin],
    enabled: Boolean(profile),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (isPlatformAdmin) {
        const { data, error } = await supabase
          .from('shops')
          .select(SHOP_COLUMNS)
          .order('name')
          .returns<ShopRow[]>();
        if (error) throw error;
        return data ?? [];
      }

      // !inner so a membership whose shop was deleted drops out rather than
      // arriving as a row with no shop attached.
      //
      // Filtered to this person's own rows: the read policy also lets staff see
      // the rest of their shop's roster, so unfiltered this answers "which
      // shops does anyone I work with belong to" and returns the same shop once
      // per colleague.
      const { data, error } = await supabase
        .from('shop_members')
        .select(`role, shops!inner(${SHOP_COLUMNS})`)
        .eq('profile_id', user!.id)
        .returns<MembershipRow[]>();

      if (error) throw error;

      // One row per membership, not per shop — deduplicated so a shop cannot
      // appear twice in the picker.
      const seen = new Set<string>();
      return (data ?? [])
        .map((m) => m.shops)
        .filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
    },
  });
}

/**
 * Which of them the owner app is currently working in, and how to change it.
 *
 * Shares its shape with useShop() so the two are interchangeable at a call
 * site, but keeps its own remembered choice: the shop someone books with as a
 * customer says nothing about the shop they manage.
 */
export function useMyShop() {
  const query = useMyShops();

  // Shared across instances, not component state: every owner screen calls this
  // through its own instance, and a private copy each would mean switching shop
  // moved the picker while the inbox, catalogue and team behind it stayed on
  // the old one.
  const { chosenId, ready, choose } = useOwnerChosenShopId();

  const resolved = resolveShop(query.data, chosenId);

  return {
    ...query,
    ...resolved,
    choose,
    // isPending, not isLoading. This query is disabled until the profile says
    // whether the caller is a platform admin, and a disabled query reports
    // isLoading false with no data — which would read as "resolved, and you
    // belong to nothing" and flash the not-on-any-staff screen at every owner
    // on every cold start. isPending stays true until there is an answer.
    isResolving: query.isPending || !ready,
  };
}

/**
 * The shop id to stamp on rows the owner creates, or null while it is still
 * being worked out — writers must treat null as "not ready", never as "any".
 */
export function useMyShopId(): string | null {
  return useMyShop().shop?.id ?? null;
}
