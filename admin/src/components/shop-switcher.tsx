'use client';

import { Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { selectShop } from '@/app/(dashboard)/shop-actions';
import type { AdminShop } from '@/lib/shop';

/**
 * Which shop the panel is working in.
 *
 * Every list in the panel — categories, services, technicians, promo codes,
 * bookings, feedback, reports — shows one shop's rows and no other. So the
 * panel has to say which, on every screen, or the lists are ambiguous in a way
 * that is invisible: nothing about a row of five services says whether the
 * other shop has five of its own.
 *
 * That is why this is a labelled panel rather than a line of text, and why it
 * renders even when there is only one shop to choose from. With one shop it is
 * not a control, but it is still the answer to "whose services are these".
 */
export function ShopSwitcher({ shop, shops }: { shop: AdminShop | null; shops: AdminShop[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!shop) return null;

  const canSwitch = shops.length > 1;

  return (
    <div className="rounded-lg border border-sidebar-border bg-background/60 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Store className="size-3" />
        Working in
      </div>

      {canSwitch ? (
        <label>
          <span className="sr-only">Shop</span>
          <select
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-medium disabled:opacity-60"
            value={shop.id}
            disabled={pending}
            onChange={(e) => {
              const id = e.target.value;
              startTransition(async () => {
                await selectShop(id);
                // Every page resolves the shop on the server, so the whole tree
                // has to come back — without this the previous shop's rows stay
                // on screen under the new shop's name, which is worse than not
                // switching at all.
                router.refresh();
              });
            }}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="truncate text-xs font-medium" title={shop.name}>
          {shop.name}
        </div>
      )}
    </div>
  );
}
