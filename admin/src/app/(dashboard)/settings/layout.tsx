import { requireAdmin } from '@/lib/auth';

/**
 * Settings is admin-only, enforced here rather than in the page.
 *
 * Note what this does and does not do: it stops the screen rendering for
 * anyone who is not a platform admin. The form writes to the shop's own row
 * from the browser under the caller's own session, and shops_admin_update now
 * accepts the platform tier or a member of that shop — so a shop owner editing
 * here changes their shop and no other. That gap used to be open, when the
 * policy resolved through the tenant-blind is_admin(); it was closed in the
 * database, which is where it had to be.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
