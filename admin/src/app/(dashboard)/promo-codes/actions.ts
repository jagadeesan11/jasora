'use server';

import { revalidatePath } from 'next/cache';

import { requireShopId } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import type { AppliesTo, DiscountType } from '@/types/promo';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * A Server Action is a public endpoint, so the caller is re-checked here
 * rather than trusting that they got as far as rendering the page.
 *
 * Everything writes as the caller: the RLS policies on promo_codes are scoped
 * to the caller's own shops, so a service key would only remove the safety net.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: UserRole }>();

  if (profile?.role !== 'admin' && profile?.role !== 'shop_owner') return null;
  return { id: user.id, supabase };
}

/** Empty string means "not set", which for these columns is null, not 0. */
function numberOrNull(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function readForm(fd: FormData) {
  const appliesTo = String(fd.get('applies_to') ?? 'all') as AppliesTo;
  return {
    code: String(fd.get('code') ?? '').trim().toUpperCase(),
    description: String(fd.get('description') ?? '').trim() || null,
    discount_type: String(fd.get('discount_type') ?? 'percentage') as DiscountType,
    discount_value: Number(fd.get('discount_value') ?? 0),
    max_discount_amount: numberOrNull(fd.get('max_discount_amount')),
    min_order_value: numberOrNull(fd.get('min_order_value')) ?? 0,
    starts_at: isoOrNull(fd.get('starts_at')),
    ends_at: isoOrNull(fd.get('ends_at')),
    max_redemptions: numberOrNull(fd.get('max_redemptions')),
    per_customer_limit: numberOrNull(fd.get('per_customer_limit')),
    applies_to: appliesTo,
    // Cleared when the targeting changes, so a code switched from
    // category-only to all does not keep a stale list that would confuse
    // anyone reading the row later.
    category_ids: appliesTo === 'category' ? fd.getAll('category_ids').map(String) : [],
    service_ids: appliesTo === 'service' ? fd.getAll('service_ids').map(String) : [],
    is_public: fd.get('is_public') === 'on',
    is_active: fd.get('is_active') === 'on',
  };
}

function validate(input: ReturnType<typeof readForm>): string | null {
  if (!/^[A-Z0-9_-]{3,32}$/.test(input.code)) {
    return 'A code is 3–32 characters, letters, digits, hyphen or underscore.';
  }
  if (!Number.isFinite(input.discount_value) || input.discount_value <= 0) {
    return 'The discount must be more than zero.';
  }
  if (input.discount_type === 'percentage' && input.discount_value > 100) {
    return 'A percentage discount cannot be more than 100.';
  }
  if (input.starts_at && input.ends_at && new Date(input.ends_at) <= new Date(input.starts_at)) {
    return 'The end date must be after the start date.';
  }
  if (input.applies_to === 'category' && input.category_ids.length === 0) {
    return 'Pick at least one category, or set this to apply everywhere.';
  }
  if (input.applies_to === 'service' && input.service_ids.length === 0) {
    return 'Pick at least one service, or set this to apply everywhere.';
  }
  return null;
}

export async function createPromoCode(fd: FormData): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };

  const input = readForm(fd);
  const problem = validate(input);
  if (problem) return { ok: false, message: problem };

  // Promo codes are unique per shop rather than globally since phase 2, so
  // the shop has to be stated: without it the insert fails on NOT NULL.
  const { error } = await caller.supabase
    .from('promo_codes')
    .insert({ ...input, shop_id: await requireShopId() });
  if (error) {
    return {
      ok: false,
      message: /duplicate|unique/i.test(error.message)
        ? 'That code already exists.'
        : error.message,
    };
  }

  revalidatePath('/promo-codes');
  return { ok: true };
}

export async function updatePromoCode(fd: FormData): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };

  const id = String(fd.get('id') ?? '');
  if (!id) return { ok: false, message: 'Missing code id.' };

  const input = readForm(fd);
  const problem = validate(input);
  if (problem) return { ok: false, message: problem };

  const { data, error } = await caller.supabase
    .from('promo_codes')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) {
    return {
      ok: false,
      message: /duplicate|unique/i.test(error.message)
        ? 'That code already exists.'
        : error.message,
    };
  }
  // PostgREST answers 204 for a write that matched nothing, which reads as
  // success; the returned rows are what prove it landed.
  if (!data || data.length === 0) return { ok: false, message: 'That code no longer exists.' };

  revalidatePath('/promo-codes');
  return { ok: true };
}

export async function setPromoActive(id: string, isActive: boolean): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };

  const { data, error } = await caller.supabase
    .from('promo_codes')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: 'That code no longer exists.' };

  revalidatePath('/promo-codes');
  return { ok: true };
}

export async function deletePromoCode(id: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };

  const { data, error } = await caller.supabase
    .from('promo_codes')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    // promo_redemptions references the code with ON DELETE RESTRICT, so a code
    // someone has actually used cannot be deleted — deleting it would erase
    // the record of a discount that was really given.
    return {
      ok: false,
      message: /foreign key|violates/i.test(error.message)
        ? 'This code has been used, so it cannot be deleted. Switch it off instead.'
        : error.message,
    };
  }
  if (!data || data.length === 0) return { ok: false, message: 'That code no longer exists.' };

  revalidatePath('/promo-codes');
  return { ok: true };
}
