'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentRole } from '@/lib/auth';
import { parseCoordinates } from '@/lib/coordinates';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * Creating a shop is the platform's job, not a shop's.
 *
 * The RLS policy says the same thing (shops_admin_insert is is_full_admin()),
 * so this check is not what enforces it — but an action that reaches the
 * database and comes back with a policy violation gives the person a message
 * about permissions rather than about what they were doing.
 */
async function requirePlatformAdmin() {
  const caller = await getCurrentRole();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

export async function createShop(fd: FormData): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) {
    return { ok: false, message: 'Only a platform admin can add a shop.' };
  }

  const name = String(fd.get('name') ?? '').trim();
  const slug = slugify(String(fd.get('slug') ?? '') || name);
  const invoicePrefix = String(fd.get('invoice_prefix') ?? '').trim().toUpperCase();

  if (!name) return { ok: false, message: 'Give the shop a name.' };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2) {
    return { ok: false, message: 'The web address needs at least two letters or numbers.' };
  }
  // Checked here as well as by the column, because this is the one field whose
  // rule is not guessable: it ends up on every printed bill, so it is short,
  // upper case, and starts with a letter.
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(invoicePrefix)) {
    return {
      ok: false,
      message: 'The invoice prefix must start with a letter and be 2 to 8 letters or numbers.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('shops').insert({
    name,
    slug,
    invoice_prefix: invoicePrefix,
    support_email: String(fd.get('support_email') ?? '').trim() || null,
    support_phone: String(fd.get('support_phone') ?? '').trim() || null,
    city: String(fd.get('city') ?? '').trim() || null,
  });

  if (error) {
    // The two unique columns are the ones people collide on, and the raw
    // message names a constraint rather than the field they typed into.
    if (/slug/.test(error.message)) {
      return { ok: false, message: 'That web address is already taken by another shop.' };
    }
    if (/invoice_prefix/.test(error.message)) {
      return { ok: false, message: 'That invoice prefix is already used by another shop.' };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath('/shops');
  return { ok: true };
}

/**
 * Switching a shop off, or back on.
 *
 * Not a delete. A shop that closes still has invoices, bookings and a history
 * that has to stay readable — and is_active is what the customer app filters
 * on, so switching off takes it out of the picker without touching any of it.
 */
export async function setShopActive(shopId: string, isActive: boolean): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) {
    return { ok: false, message: 'Only a platform admin can do that.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shops')
    .update({ is_active: isActive })
    .eq('id', shopId)
    .select('id');

  if (error) return { ok: false, message: error.message };
  // PostgREST answers 204 for a write that matched nothing, which reads as
  // success; the returned rows are what prove it landed.
  if (!data || data.length === 0) return { ok: false, message: 'That shop no longer exists.' };

  revalidatePath('/shops');
  return { ok: true };
}

/**
 * Putting someone on a shop's staff.
 *
 * A shop with no members cannot be run: every owner-side policy is written
 * against shop_members, so until somebody is in it the only person who can
 * touch the shop is a platform admin. That is why the shop list flags an empty
 * one rather than leaving it looking finished.
 *
 * The profile's own role is deliberately not changed here. Whether someone is
 * a shop_owner is a fact about the person and lives under Users; which shops
 * they work at is a fact about the shop and lives here. Conflating them would
 * mean adding a technician to a second shop could silently promote them.
 */
export async function addShopMember(fd: FormData): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) {
    return { ok: false, message: 'Only a platform admin can change staff.' };
  }

  const shopId = String(fd.get('shop_id') ?? '');
  const profileId = String(fd.get('profile_id') ?? '');
  const role = String(fd.get('role') ?? 'shop_owner');

  if (!shopId || !profileId) return { ok: false, message: 'Pick someone to add.' };
  if (role !== 'shop_owner' && role !== 'technician') {
    return { ok: false, message: 'Pick a role.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('shop_members')
    .insert({ shop_id: shopId, profile_id: profileId, role });

  if (error) {
    if (/duplicate|unique|already exists/i.test(error.message)) {
      return { ok: false, message: 'They are already on this shop.' };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/shops/${shopId}`);
  return { ok: true };
}

/**
 * The legal documents every shop operates under.
 *
 * Platform admin only, matching the policy on the table: these describe who
 * holds customer data across all shops, which is a statement only the platform
 * can make.
 */
export async function savePlatformLegal(fd: FormData): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) {
    return { ok: false, message: 'Only a platform admin can change these.' };
  }

  const privacy = String(fd.get('privacy_url') ?? '').trim();
  const terms = String(fd.get('terms_url') ?? '').trim();

  for (const [label, value] of [
    ['privacy policy', privacy],
    ['terms', terms],
  ] as const) {
    // https only: an app store will reject a policy served over http, and these
    // are the one pair of links that must survive a reviewer clicking them.
    if (value && !value.startsWith('https://')) {
      return { ok: false, message: `The ${label} URL has to start with https://.` };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .update({ privacy_url: privacy || null, terms_url: terms || null })
    .eq('id', true)
    .select('id');

  if (error) return { ok: false, message: error.message };
  // PostgREST answers 204 for a write that matched nothing, which reads as
  // success; the returned rows are what prove it landed.
  if (!data || data.length === 0) return { ok: false, message: 'Could not save those.' };

  revalidatePath('/shops');
  return { ok: true };
}

/**
 * Where the shop is, and how far it will travel.
 *
 * Not platform-admin only: a shop's own location and range are its business,
 * and the RLS policy on shops already lets a member update their own row. The
 * scope check is getShopContext(), which is what decides whose shop this is.
 */
export async function saveShopLocation(fd: FormData): Promise<ActionResult> {
  const { shop } = await getShopContext();
  if (!shop) return { ok: false, message: 'You do not have a shop to edit.' };

  const radiusRaw = String(fd.get('service_radius_km') ?? '').trim();
  const radius = Number(radiusRaw);
  if (!Number.isInteger(radius) || radius < 1 || radius > 1000) {
    return { ok: false, message: 'The service range has to be a whole number of kilometres, 1 to 1000.' };
  }

  const pasted = String(fd.get('location') ?? '').trim();

  // Clearing the box clears the pin. A shop with no location is still listed,
  // just not distance-filtered, so this is a real thing to want rather than an
  // accident to guard against.
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (pasted) {
    const parsed = parseCoordinates(pasted);
    if (!parsed.ok) return { ok: false, message: parsed.reason };
    latitude = parsed.value.latitude;
    longitude = parsed.value.longitude;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shops')
    .update({ latitude, longitude, service_radius_km: radius })
    .eq('id', shop.id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  // PostGREST answers 204 for a write that matched nothing, which reads as
  // success; the returned rows are what prove it landed.
  if (!data || data.length === 0) return { ok: false, message: 'That could not be saved.' };

  revalidatePath('/shops');
  return { ok: true };
}

export async function removeShopMember(shopId: string, profileId: string): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) {
    return { ok: false, message: 'Only a platform admin can change staff.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shop_members')
    .delete()
    .eq('shop_id', shopId)
    .eq('profile_id', profileId)
    .select('shop_id');

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: 'They are not on this shop.' };

  revalidatePath(`/shops/${shopId}`);
  return { ok: true };
}
