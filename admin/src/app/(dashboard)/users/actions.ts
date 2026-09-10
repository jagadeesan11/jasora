'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

const ROLES: UserRole[] = ['customer', 'technician', 'admin', 'shop_owner'];

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * A Server Action is a public endpoint — anything that can reach the app can
 * invoke it. The service-role client below bypasses RLS entirely, so every
 * action re-checks the caller here rather than trusting that they got as far
 * as rendering the page.
 *
 * Platform `admin` only. These actions create accounts, delete them and
 * reset passwords using the service key — so accepting a shop owner here would
 * have let one mint an admin account or take over an existing one, whatever
 * RLS says. Managing who has an account is running the business, not running
 * the shop.
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

  if (profile?.role !== 'admin') return null;
  // The caller's own client is returned as well, because some writes have to
  // be made AS them rather than with the service key — see updateUser.
  return { id: user.id, supabase };
}

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set on the server.');
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'Only an admin can add users.' };

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const role = String(formData.get('role') ?? 'technician') as UserRole;

  if (!email || !password) return { ok: false, message: 'Email and password are required.' };
  if (password.length < 8) return { ok: false, message: 'Use at least 8 characters.' };
  if (!ROLES.includes(role)) return { ok: false, message: 'Unknown role.' };

  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    // Staff accounts are created by someone who already knows the person, so
    // there is nobody to confirm an email to.
    email_confirm: true,
  });
  if (error || !data.user) return { ok: false, message: error?.message ?? 'Could not create user.' };

  // handle_new_user() has already inserted a profile with role 'customer'.
  // prevent_self_role_escalation fires on UPDATE and does not exempt the
  // service role, so the row is replaced rather than patched.
  await admin.from('profiles').delete().eq('id', data.user.id);
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, role, name: name || null, phone: phone || null, email });

  if (profileError) {
    // Leaving an auth user with no profile would be a half-created account
    // that cannot be fixed from this screen.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, message: profileError.message };
  }

  revalidatePath('/users');
  return { ok: true };
}

export async function updateUser(formData: FormData): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'Only an admin can change users.' };

  const id = String(formData.get('id') ?? '');
  const role = String(formData.get('role') ?? '') as UserRole;
  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!id || !ROLES.includes(role)) return { ok: false, message: 'Unknown user or role.' };
  // Must stay `admin` exactly, not merely shop-side. Users is now admin-only,
  // so demoting yourself to shop_owner would lock you out of the one screen
  // that could put it back — and if you were the last admin, lock everyone out.
  if (id === caller.id && role !== 'admin') {
    return { ok: false, message: 'You cannot remove your own admin access.' };
  }

  // Written as the caller, NOT with the service key. prevent_self_role_escalation
  // permits a role change only when is_platform_admin() is true, and that reads
  // auth.uid() — which the service role does not have. So the service key,
  // despite bypassing RLS, is the one identity that CANNOT change a role:
  // it fails with "Only admins can change a profile's role".
  //
  // The caller is already known to be an admin, so their own session satisfies
  // both the RLS policy and the trigger. The last-admin guard still applies and
  // will refuse a change that would leave nobody in charge.
  const { error } = await caller.supabase
    .from('profiles')
    .update({ role, name: name || null, phone: phone || null })
    .eq('id', id);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/users');
  return { ok: true };
}

export async function deleteUser(formData: FormData): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'Only an admin can remove users.' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, message: 'Unknown user.' };
  if (id === caller.id) return { ok: false, message: 'You cannot delete your own account.' };

  const admin = serviceClient();
  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    // Deleting a customer cascades to their bookings, where the settled-job
    // guard refuses. Say so plainly rather than surfacing a raw 500.
    const friendly = /booking|completed|money/i.test(error.message)
      ? 'This customer has completed jobs, which cannot be deleted because their bills must be kept. Remove or reassign those bookings first.'
      : error.message;
    return { ok: false, message: friendly };
  }

  revalidatePath('/users');
  return { ok: true };
}

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, message: 'Only an admin can reset a password.' };

  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!id) return { ok: false, message: 'Unknown user.' };
  if (password.length < 8) return { ok: false, message: 'Use at least 8 characters.' };

  // The Auth Admin API is the only way to set someone else's password without
  // their current one. It needs the service key, hence the server action.
  const admin = serviceClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });

  if (error) return { ok: false, message: error.message };

  // Deliberately no revalidatePath: a password is not shown anywhere on the
  // page, so there is nothing on screen to refresh.
  return { ok: true };
}
