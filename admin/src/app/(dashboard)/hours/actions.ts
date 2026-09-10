'use server';

import { revalidatePath } from 'next/cache';

import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * Opening hours and blocked days, for the shop being worked in.
 *
 * Everything writes as the caller rather than with the service key: the
 * policies on both tables are scoped to the caller's own shops, so a shop owner
 * editing here can only reach their own hours, and the service key would remove
 * that safety net rather than add capability.
 *
 * Nothing here is platform-admin only. Opening hours are a shop's own business
 * and its owner has always been able to set them from the mobile app; this is
 * the same thing on a bigger screen.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DayInput {
  weekday: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
}

export async function saveHours(days: DayInput[]): Promise<ActionResult> {
  const { shop } = await getShopContext();
  if (!shop) return { ok: false, message: 'You do not have a shop to edit.' };

  for (const day of days) {
    if (day.weekday < 0 || day.weekday > 6) {
      return { ok: false, message: 'That is not a day of the week.' };
    }
    // Only checked for days that are open: a closed day's times are not shown
    // and should not have to be valid to save the ones that are.
    if (!day.is_open) continue;

    if (!TIME.test(day.opens_at) || !TIME.test(day.closes_at)) {
      return { ok: false, message: 'Times need to look like 09:00.' };
    }
    if (day.opens_at >= day.closes_at) {
      // String comparison is safe on zero-padded 24-hour clock times.
      return { ok: false, message: 'A day has to close after it opens.' };
    }
  }

  const supabase = await createClient();

  // Updated one day at a time rather than upserted as a batch. The rows already
  // exist — a shop is seeded with a full week when it is created — so an upsert
  // would only be a way to create rows that should not be creatable, and it
  // would need shop_id in the payload to do it.
  for (const day of days) {
    const { data, error } = await supabase
      .from('business_hours')
      .update({ is_open: day.is_open, opens_at: day.opens_at, closes_at: day.closes_at })
      .eq('shop_id', shop.id)
      .eq('weekday', day.weekday)
      .select('weekday');

    if (error) return { ok: false, message: error.message };
    // PostgREST answers 204 for a write that matched nothing, which reads as
    // success; the returned rows are what prove it landed.
    if (!data || data.length === 0) {
      return { ok: false, message: 'Those hours could not be saved. Reload and try again.' };
    }
  }

  revalidatePath('/hours');
  return { ok: true };
}

/**
 * How many jobs this shop can have in hand at once.
 *
 * Bookings that would exceed it are refused by create_booking, so this number
 * is the only thing standing between a one-bay shop and four cars turning up on
 * the same morning.
 */
export async function saveCapacity(concurrentJobs: number): Promise<ActionResult> {
  const { shop } = await getShopContext();
  if (!shop) return { ok: false, message: 'You do not have a shop to edit.' };

  if (!Number.isInteger(concurrentJobs) || concurrentJobs < 1 || concurrentJobs > 50) {
    return { ok: false, message: 'That has to be a whole number between 1 and 50.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shops')
    .update({ concurrent_jobs: concurrentJobs })
    .eq('id', shop.id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  // PostgREST answers 204 for a write that matched nothing, which reads as
  // success; the returned rows are what prove it landed.
  if (!data || data.length === 0) return { ok: false, message: 'That could not be saved.' };

  revalidatePath('/hours');
  return { ok: true };
}

export async function addClosure(fd: FormData): Promise<ActionResult> {
  const { shop } = await getShopContext();
  if (!shop) return { ok: false, message: 'You do not have a shop to edit.' };

  const closedOn = String(fd.get('closed_on') ?? '').trim();
  const reason = String(fd.get('reason') ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) {
    return { ok: false, message: 'Pick a date.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('shop_closures')
    // shop_id is stated: shop_closures has no parent row to derive it from.
    .insert({ shop_id: shop.id, closed_on: closedOn, reason: reason || null });

  if (error) {
    return {
      ok: false,
      message: /duplicate|unique/i.test(error.message)
        ? 'That day is already blocked.'
        : error.message,
    };
  }

  revalidatePath('/hours');
  return { ok: true };
}

export async function removeClosure(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  // By primary key, so it needs no shop filter: the id names one row, and the
  // write policy already refuses one belonging to another shop.
  const { data, error } = await supabase
    .from('shop_closures')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: 'That day is no longer blocked.' };

  revalidatePath('/hours');
  return { ok: true };
}
