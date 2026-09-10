/**
 * Which shop the app is showing.
 *
 * Until now there was exactly one, held in a singleton row, so "the shop" was
 * never a question. With several, something has to answer it before the first
 * screen renders — the sign-in screen already says "Welcome back to <shop>".
 *
 * Pure, so the rules can be tested without a device or a network.
 */

export interface ShopRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  address_line: string | null;
  city: string | null;
  postal_code: string | null;
  cod_enabled: boolean;
  online_payment_enabled: boolean;
  privacy_url: string | null;
  terms_url: string | null;
  instagram_url: string | null;
  whatsapp_number: string | null;
  is_active: boolean;
  /** Null until the shop drops a pin. It is still listed either way. */
  latitude: number | null;
  longitude: number | null;
  /** How far this shop will travel, set by the shop itself. */
  service_radius_km: number;
  /** How many jobs it can have in hand at once — bays, ramps, however it counts. */
  concurrent_jobs: number;
}

export interface ShopChoice {
  /** The shop to render, or null when the customer has to pick one. */
  shop: ShopRow | null;
  /** True when there is a real choice to make and nobody has made it. */
  mustChoose: boolean;
  /** Everything selectable, for the picker. */
  options: ShopRow[];
}

/**
 * Resolution order: a shop the customer already chose, then the only one there
 * is, then ask.
 *
 * A remembered choice that has since been switched off is treated as no choice
 * rather than an error — a shop closing should send the customer to the picker,
 * not to a dead screen.
 */
export function resolveShop(
  shops: ShopRow[] | undefined,
  preferredId?: string | null,
): ShopChoice {
  const options = (shops ?? []).filter((s) => s.is_active);

  if (options.length === 0) return { shop: null, mustChoose: false, options };

  const preferred = preferredId ? options.find((s) => s.id === preferredId) : undefined;
  if (preferred) return { shop: preferred, mustChoose: false, options };

  // One shop is not a choice. This is what keeps a single-shop install behaving
  // exactly as it did before any of this, with no picker in the way.
  if (options.length === 1) return { shop: options[0], mustChoose: false, options };

  return { shop: null, mustChoose: true, options };
}
