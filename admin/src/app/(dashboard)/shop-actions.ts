'use server';

import { cookies } from 'next/headers';

import { SHOP_COOKIE_NAME, getShopContext } from '@/lib/shop';

/**
 * Remember which shop the admin is working in.
 *
 * The id is checked against the caller's own list before it is stored. That
 * check is not what enforces tenancy — RLS does, and would refuse the writes
 * regardless — but storing an arbitrary id would leave the panel claiming to
 * be in a shop whose every query comes back empty, which is a confusing way to
 * be told "not yours".
 */
export async function selectShop(shopId: string): Promise<void> {
  const { shops } = await getShopContext();
  if (!shops.some((s) => s.id === shopId)) return;

  (await cookies()).set(SHOP_COOKIE_NAME, shopId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
