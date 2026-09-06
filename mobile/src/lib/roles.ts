import type { UserRole } from '@/hooks/use-profile';

/**
 * Who sees the shop-side app rather than the customer one.
 *
 * Mirrors the staff roles the database recognises — admin and shop_owner —
 * plus technicians — they get a narrower view of the same board, and the RLS policy
 * on bookings already limits them to their own assigned jobs.
 *
 * This decides navigation only. It is not a permission: every read and write
 * is still gated server-side, so a wrong answer here shows someone the wrong
 * screens, never someone else's data.
 */
const SHOP_ROLES: UserRole[] = ['admin', 'shop_owner', 'technician'];

export function isShopSide(role: UserRole | null | undefined): boolean {
  return !!role && SHOP_ROLES.includes(role);
}

/** Full run-the-shop rights, as opposed to a technician's narrower view. */
export function isOwnerSide(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'shop_owner';
}
