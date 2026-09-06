import { requireAdmin } from '@/lib/auth';

/**
 * Shops is the platform's own screen: it creates tenants and decides who staffs
 * them, which is above any single shop. Gated in the layout so it covers every
 * page under the segment, including ones added later — hiding the nav link is
 * not access control, because the URL still resolves.
 */
export default async function ShopsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
