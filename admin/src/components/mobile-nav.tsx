'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { NexoraMark } from '@/components/nexora-mark';
import { SidebarNav } from '@/components/sidebar-nav';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The navigation for screens too narrow to hold the sidebar.
 *
 * The desktop sidebar is a fixed 240px, which on a 375px phone leaves 135px
 * for the actual page. Below `md` it is hidden entirely and replaced by this:
 * a top bar with a hamburger, and a drawer holding the same nav plus the
 * theme toggle and sign-out that otherwise live in the sidebar footer — so
 * nothing reachable on desktop is missing on a phone.
 */
export function MobileNav({
  email,
  role,
  shopName,
}: {
  email?: string;
  role?: string | null;
  // Named in the bar because the sidebar that carries it on desktop is behind
  // a menu button here, and every list on the screen below shows one shop.
  shopName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    // Without this the page behind scrolls under the drawer on iOS.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus moves into the drawer so the next Tab stays inside it rather than
    // landing on the page underneath.
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="-ml-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
        >
          <Menu className="size-5" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <NexoraMark className="size-6 shrink-0 text-foreground" />
          {shopName ? (
            <span className="truncate text-sm font-semibold tracking-tight" title={shopName}>
              {shopName}
            </span>
          ) : (
            <>
              <span className="truncate text-sm font-semibold tracking-tight">Nexora</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">Admin</span>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* A button, not a div with onClick: the scrim is a real dismiss
              control, so it should be one to a screen reader too. */}
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/50 animate-in fade-in-0"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-xl animate-in slide-in-from-left duration-200"
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2.5">
                <NexoraMark className="size-7 text-foreground" />
                <div className="leading-tight">
                  <div className="text-sm font-semibold tracking-tight">Nexora</div>
                  <div className="text-[11px] text-muted-foreground">Admin</div>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3">
              <SidebarNav role={role} onNavigate={() => setOpen(false)} />
            </div>

            <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
              <ThemeToggle />
              {email && (
                <div className="flex items-center gap-2 rounded-lg px-1">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {email[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email}>
                    {email}
                  </div>
                </div>
              )}
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
