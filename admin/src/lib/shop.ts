import { cookies } from 'next/headers';

import { getCurrentRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * Which shop the admin panel is working in.
 *
 * There are two tiers above a row now, and they resolve differently:
 *
 *   platform admin (profiles.role = 'admin')  administers every shop, belongs
 *                                             to none, and picks one to work in
 *   shop owner     (shop_members)             administers the shops they are a
 *                                             member of, usually exactly one
 *
 * Everything the panel writes is stamped with the shop this returns, so a
 * wrong answer here files rows under the wrong tenant. It is therefore never
 * guessed: a choice that does not appear in the caller's own list is discarded
 * rather than trusted, which also means a cookie kept after someone's access
 * is withdrawn stops working the moment their membership does.
 */

const SHOP_COOKIE = 'jasora_shop';

export interface AdminShop {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface ShopContext {
  /** The shop being worked in, or null when the caller administers none. */
  shop: AdminShop | null;
  /** Everything the caller may switch to. */
  shops: AdminShop[];
  /** True for profiles.role = 'admin': the tier above all shops. */
  isPlatformAdmin: boolean;
}

export async function getShopContext(): Promise<ShopContext> {
  const caller = await getCurrentRole();
  if (!caller) return { shop: null, shops: [], isPlatformAdmin: false };

  const supabase = await createClient();
  const isPlatformAdmin = caller.role === 'admin';

  // A platform admin reads shops directly; everyone else reaches them through
  // their membership rows, so the list cannot include a shop they do not run.
  const { data, error } = isPlatformAdmin
    ? await supabase.from('shops').select('id, slug, name, is_active').order('name')
    : await supabase
        .from('shop_members')
        .select('shops!inner(id, slug, name, is_active)')
        // This caller's own rows. The read policy also lets staff see the rest
        // of their shop's roster, which is what a team screen needs — but the
        // question here is "which shops am I in", and unfiltered a colleague's
        // membership answers it too.
        .eq('profile_id', caller.id)
        .then((r) => ({
          data: (r.data as { shops: AdminShop }[] | null)?.map((m) => m.shops) ?? null,
          error: r.error,
        }));

  if (error) throw error;

  // Deduplicated by id, because this query returns one row per membership
  // rather than one per shop: anything yielding two rows for one shop yields
  // that shop twice. That is how the missing filter above surfaced — as
  // duplicate React keys in the switcher rather than as anything that looked
  // like a permissions problem.
  const seen = new Set<string>();
  const shops = (data ?? [])
    .filter((s) => s.is_active)
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  const chosen = (await cookies()).get(SHOP_COOKIE)?.value;

  return {
    // The cookie is a preference, not a credential — it only ever selects from
    // a list the database already said this caller may see.
    shop: shops.find((s) => s.id === chosen) ?? shops[0] ?? null,
    shops,
    isPlatformAdmin,
  };
}

/**
 * The shop id to stamp on new rows, or a thrown error.
 *
 * Server actions call this rather than reading the context and checking it
 * themselves: a write with no shop must fail loudly at the top of the action,
 * not arrive at the database as a null and come back as a constraint
 * violation the person reading it cannot act on.
 */
export async function requireShopId(): Promise<string> {
  const { shop } = await getShopContext();
  if (!shop) throw new Error('You do not have a shop to add this to.');
  return shop.id;
}

export const SHOP_COOKIE_NAME = SHOP_COOKIE;
