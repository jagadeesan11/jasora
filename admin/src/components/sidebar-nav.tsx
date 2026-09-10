'use client';

import {
  CalendarCheck,
  ChartColumn,
  LayoutGrid,
  Layers,
  BadgePercent,
  LifeBuoy,
  Settings,
  Shield,
  Clock,
  Star,
  Store,
  Users,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

// `adminOnly` marks the areas that run the platform rather than a shop: which
// shops exist, who has an account, and how the product is configured. Everyone
// else on the shop side gets the day-to-day screens.
//
// This only hides the link. The segment layouts under /shops, /users and
// /settings do the actual gating, because a hidden link is still a working URL.
const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', Icon: LayoutGrid },
  { href: '/categories', label: 'Categories', Icon: Layers },
  { href: '/services', label: 'Services', Icon: Wrench },
  { href: '/promo-codes', label: 'Promo codes', Icon: BadgePercent },
  { href: '/bookings', label: 'Bookings', Icon: CalendarCheck },
  { href: '/technicians', label: 'Technicians', Icon: Users },
  { href: '/hours', label: 'Hours', Icon: Clock },
  { href: '/feedback', label: 'Feedback', Icon: Star },
  { href: '/support', label: 'Help requests', Icon: LifeBuoy },
  { href: '/reports', label: 'Reports', Icon: ChartColumn },
  { href: '/shops', label: 'Shops', Icon: Store, adminOnly: true },
  { href: '/users', label: 'Users', Icon: Shield, adminOnly: true },
  { href: '/settings', label: 'Settings', Icon: Settings, adminOnly: true },
];

// `onNavigate` lets the mobile drawer close itself when a link is tapped.
// Reacting to a pathname change in an effect also works, but sets state
// during commit and cascades an extra render.
export function SidebarNav({
  role,
  onNavigate,
}: {
  role?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Unknown role sees the restricted set. Failing closed matters here: if the
  // profile lookup ever comes back empty, the safe reading is "not an admin".
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin');

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label, Icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
            )}
          >
            {/* Active rail — encodes selection in form as well as colour, so
                it survives low-contrast displays and colour-blind viewing. */}
            <span
              className={cn(
                'absolute left-0 h-5 w-0.5 rounded-r-full bg-primary transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
            <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
