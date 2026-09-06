import { redirect } from 'next/navigation';

import { MobileNav } from '@/components/mobile-nav';
import { NexoraMark } from '@/components/nexora-mark';
import { ShopSwitcher } from '@/components/shop-switcher';
import { SidebarNav } from '@/components/sidebar-nav';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentRole } from '@/lib/auth';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caller = await getCurrentRole();
  const role = caller?.role ?? null;
  const { shop, shops } = await getShopContext();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Hidden below `md`, where MobileNav's drawer takes over. A 240px
          sidebar on a 375px phone leaves 135px for the page itself. */}
      <aside className="hidden border-r border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <NexoraMark className="size-7 text-foreground" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Nexora</div>
            <div className="text-[11px] text-muted-foreground">Admin</div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <ShopSwitcher shop={shop} shops={shops} />
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav role={role} />
        </div>

        <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 rounded-lg px-1">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {user.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={user.email}>
              {user.email}
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <MobileNav email={user.email} role={role} shopName={shop?.name ?? null} />
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
