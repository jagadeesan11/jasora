'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export type SupportStatus = 'open' | 'in_progress' | 'resolved';

const STATUSES: SupportStatus[] = ['open', 'in_progress', 'resolved'];

/**
 * A Server Action is a public endpoint — anything that can reach the app can
 * invoke it, so the caller is re-checked here rather than trusting that they
 * got as far as rendering the page.
 *
 * Unlike the Users actions, everything below writes as the caller: the RLS
 * policies on support_requests are scoped to the caller's own shops, so the
 * service key would only remove the safety net, not add capability.
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

export async function setSupportStatus(id: string, status: SupportStatus): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };
  if (!STATUSES.includes(status)) return { ok: false, message: 'Unknown status.' };

  const { data, error } = await caller.supabase
    .from('support_requests')
    .update({
      status,
      // Stamped only on the way in to resolved, and cleared on the way out, so
      // "resolved 3 days ago" never survives a reopen.
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      resolved_by: status === 'resolved' ? caller.id : null,
    })
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  // PostgREST answers 204 for a write that matched nothing, which reads as
  // success; the returned rows are what actually prove it landed.
  if (!data || data.length === 0) return { ok: false, message: 'That request no longer exists.' };

  revalidatePath('/support');
  return { ok: true };
}

export async function saveSupportNote(id: string, note: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };
  if (note.length > 2000) return { ok: false, message: 'Notes are limited to 2000 characters.' };

  const { data, error } = await caller.supabase
    .from('support_requests')
    .update({ admin_note: note.trim() || null })
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: 'That request no longer exists.' };

  revalidatePath('/support');
  return { ok: true };
}

export async function deleteSupportRequest(id: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'You need to be an admin to do that.' };

  const { data, error } = await caller.supabase
    .from('support_requests')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: 'That request no longer exists.' };

  revalidatePath('/support');
  return { ok: true };
}
