import { useQuery } from '@tanstack/react-query';

import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/constants/links';
import { resolveShop, type ShopRow } from '@/lib/current-shop';
import { createShopChoice } from '@/lib/shop-choice';
import { supabase } from '@/lib/supabase';

/**
 * The shape every screen already reads. Kept exactly as it was so the fifteen
 * files using it did not have to change when the source did — the singleton
 * app_settings row became one row per shop in the shops table, and this hook
 * is the seam where that is absorbed.
 *
 * The field names still read app_settings' vocabulary (`shop_name` rather than
 * `name`). That is cosmetic debt, deliberately left: renaming it would have
 * meant touching every call site in the same change that repointed the query,
 * and one of those two things is much easier to review than both at once.
 */
export interface AppSettings {
  shop_name: string;
  shop_logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  shop_address_line: string | null;
  shop_city: string | null;
  shop_postal_code: string | null;
  cod_enabled: boolean;
  online_payment_enabled: boolean;
  privacy_url: string | null;
  instagram_url: string | null;
  whatsapp_number: string | null;
  terms_url: string | null;
}

/** Used until the network answers, and if it never does. The app must still
 *  render a shop name and a way to reach support offline. */
export const FALLBACK_SETTINGS: AppSettings = {
  shop_name: 'Jasora',
  shop_logo_url: null,
  support_email: SUPPORT_EMAIL,
  support_phone: SUPPORT_PHONE,
  shop_address_line: null,
  shop_city: null,
  shop_postal_code: null,
  cod_enabled: false,
  online_payment_enabled: true,
  privacy_url: null,
  instagram_url: null,
  whatsapp_number: null,
  terms_url: null,
};

const SHOP_FIELDS =
  'id, slug, name, logo_url, support_email, support_phone, address_line, city, postal_code, ' +
  'cod_enabled, online_payment_enabled, privacy_url, terms_url, instagram_url, whatsapp_number, is_active, ' +
  'latitude, longitude, service_radius_km, concurrent_jobs';

// Shared across every hook instance — see lib/shop-choice.
const useChosenShopId = createShopChoice('jasora.shop_id');

function toSettings(shop: ShopRow): AppSettings {
  return {
    shop_name: shop.name,
    shop_logo_url: shop.logo_url,
    support_email: shop.support_email,
    support_phone: shop.support_phone,
    shop_address_line: shop.address_line,
    shop_city: shop.city,
    shop_postal_code: shop.postal_code,
    cod_enabled: shop.cod_enabled,
    online_payment_enabled: shop.online_payment_enabled,
    privacy_url: shop.privacy_url,
    instagram_url: shop.instagram_url,
    whatsapp_number: shop.whatsapp_number,
    terms_url: shop.terms_url,
  };
}

/**
 * Every active shop. Readable without a session, because the sign-in screen
 * names the shop before anyone has one.
 */
export function useShops() {
  return useQuery({
    queryKey: ['shops'],
    // Changes are rare and an admin edit does not need to reach a phone
    // mid-session, but a cold start should not show yesterday's phone number.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shops')
        .select(SHOP_FIELDS)
        .eq('is_active', true)
        .order('name')
        .returns<ShopRow[]>();

      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The shop this app is currently showing, plus the means to change it.
 *
 * `mustChoose` is true only when there is a real choice nobody has made: with
 * one shop it never is, so a single-shop install behaves exactly as it did
 * before multi-tenancy, with no picker in the way.
 */
export function useShop() {
  const query = useShops();
  const { chosenId, ready, choose } = useChosenShopId();

  const resolved = resolveShop(query.data, chosenId);

  return {
    ...query,
    ...resolved,
    choose,
    // Nothing should decide "you must pick" before the stored choice is read.
    isResolving: query.isPending || !ready,
  };
}

/**
 * The platform's own legal documents.
 *
 * The privacy policy describes who holds personal data and what they do with
 * it, and that is Jasora rather than any one shop: every shop's customers live
 * in one database the platform controls and answers for. So it is one document,
 * and a shop's own column is an override for the rare shop that needs its own.
 *
 * Readable without a session — a privacy policy only signed-in users can find
 * is not a privacy policy, and an app store reviewer has no account.
 */
export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform_settings'],
    // These change about once a year.
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('privacy_url, terms_url')
        .maybeSingle<{ privacy_url: string | null; terms_url: string | null }>();

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Shop details the admin configures at runtime, in the shape screens expect.
 * Readable without a session, so the sign-in screen can use it too.
 */
export function useAppSettings(forShopId?: string | null) {
  const { shop: current, ...rest } = useShop();
  const { data: platform } = usePlatformSettings();
  // Same query key as useShop uses, so naming a shop costs no extra fetch.
  const { data: shops } = useShops();

  // A named shop wins over the selected one. The shop page and everything on it
  // is reachable by deep link, where "whichever shop was selected" is a guess.
  const shop = forShopId ? (shops?.find((s) => s.id === forShopId) ?? null) : current;

  const settings = shop ? toSettings(shop) : FALLBACK_SETTINGS;

  return {
    ...rest,
    shopId: shop?.id ?? null,
    // Callers want a value, not a maybe — every field has a sane default.
    settings: {
      ...settings,
      // The platform document unless this shop names its own. Without this a
      // newly onboarded shop ships with no privacy policy at all — its
      // customers see "not published yet" — and nothing in the product says so.
      privacy_url: settings.privacy_url ?? platform?.privacy_url ?? null,
      terms_url: settings.terms_url ?? platform?.terms_url ?? null,
    },
  };
}

export function formatShopAddress(settings: AppSettings): string | null {
  const parts = [settings.shop_address_line, settings.shop_city, settings.shop_postal_code];
  const address = parts.filter(Boolean).join(', ');
  return address || null;
}
