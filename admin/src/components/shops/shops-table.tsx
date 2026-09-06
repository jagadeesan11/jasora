'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setShopActive } from '@/app/(dashboard)/shops/actions';
import { selectShop } from '@/app/(dashboard)/shop-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ShopRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  invoice_prefix: string;
  is_active: boolean;
  /** PostgREST returns an aggregate embed as a one-element array. */
  shop_members: { count: number }[];
}

export function ShopsTable({
  shops,
  currentShopId,
}: {
  shops: ShopRow[];
  currentShopId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? 'That did not work.');
      router.refresh();
    });
  }

  if (shops.length === 0) {
    return <p className="text-sm text-muted-foreground">No shops yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Invoice prefix</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Open for business</TableHead>
              <TableHead className="text-right">Working in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shops.map((shop) => {
              const staff = shop.shop_members[0]?.count ?? 0;
              const isCurrent = shop.id === currentShopId;

              return (
                <TableRow key={shop.id}>
                  <TableCell>
                    <Link href={`/shops/${shop.id}`} className="font-medium hover:underline">
                      {shop.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      /{shop.slug}
                      {shop.city ? ` · ${shop.city}` : ''}
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-xs">{shop.invoice_prefix}</TableCell>

                  <TableCell>
                    {staff === 0 ? (
                      // The one state worth calling out. A shop with no members
                      // has no one who can run it — every owner-side policy is
                      // written against shop_members — and it otherwise looks
                      // exactly like a finished shop.
                      <Badge variant="destructive">Nobody yet</Badge>
                    ) : (
                      <span className="text-sm">
                        {staff} {staff === 1 ? 'person' : 'people'}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Switch
                      checked={shop.is_active}
                      disabled={pending}
                      aria-label={`${shop.name} open for business`}
                      onCheckedChange={(next) => run(() => setShopActive(shop.id, next))}
                    />
                  </TableCell>

                  <TableCell className="text-right">
                    {isCurrent ? (
                      <Badge>Current</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            await selectShop(shop.id);
                            return { ok: true };
                          })
                        }
                      >
                        Switch to
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Switching changes which shop every other screen edits — its catalogue, staff, hours and
        settings. Turning a shop off hides it from the app without deleting anything.
      </p>
    </div>
  );
}
