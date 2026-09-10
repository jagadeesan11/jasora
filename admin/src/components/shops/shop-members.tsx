'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { addShopMember, removeShopMember } from '@/app/(dashboard)/shops/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { matchesUserQuery } from '@/lib/user-search';
import type { AppUser } from '@/types/database';

export interface MemberRow {
  profile_id: string;
  role: string;
  profiles: { id: string; name: string | null; email: string | null; phone: string | null; role: string } | null;
}

/**
 * Who works at this shop.
 *
 * This is the screen that makes a new shop usable. Every owner-side policy is
 * written against shop_members, so a shop with nobody in it can only be touched
 * by a platform admin — it will look complete in the list, accept a catalogue,
 * and still have no one able to run it.
 *
 * Membership is kept separate from the person's own role on purpose. Whether
 * someone is a shop_owner is a fact about them and is set under Users; which
 * shops they work at is a fact about the shop and is set here. Doing both from
 * one control would mean adding a technician to a second shop could silently
 * promote them.
 */
export function ShopMembers({
  shopId,
  shopName,
  members,
  candidates,
}: {
  shopId: string;
  shopName: string;
  members: MemberRow[];
  candidates: AppUser[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [role, setRole] = useState<'shop_owner' | 'technician'>('shop_owner');

  const alreadyIn = useMemo(() => new Set(members.map((m) => m.profile_id)), [members]);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return candidates
      .filter((c) => !alreadyIn.has(c.id))
      .filter((c) =>
        matchesUserQuery(
          { name: c.name, email: c.email, phone: c.phone, login_email: null, login_phone: null },
          query,
        ),
      )
      .slice(0, 6);
  }, [candidates, query, alreadyIn]);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? 'That did not work.');
        return;
      }
      setQuery('');
      setPicked(null);
      router.refresh();
    });
  }

  const pickedUser = candidates.find((c) => c.id === picked) ?? null;

  return (
    <div className="max-w-2xl space-y-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Staff</h2>
          <p className="text-xs text-muted-foreground">
            Owners manage the shop from the mobile app. Technicians get assigned jobs.
          </p>
        </div>

        {members.length === 0 ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            Nobody works at {shopName} yet, so nobody can run it. Add an owner below.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Here as</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.profile_id}>
                    <TableCell>
                      <div className="font-medium">{m.profiles?.name ?? 'Unnamed'}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.profiles?.email ?? m.profiles?.phone ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === 'shop_owner' ? 'default' : 'secondary'}>
                        {m.role === 'shop_owner' ? 'Owner' : 'Technician'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => removeShopMember(shopId, m.profile_id))}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Add someone</h2>
          <p className="text-xs text-muted-foreground">
            Search by name, email or phone. They need an account already.
          </p>
        </div>

        <div>
          <Label htmlFor="member-search" className="mb-1.5">
            Who
          </Label>
          <Input
            id="member-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder="Name, email or phone"
          />
        </div>

        {matches.length > 0 && !picked ? (
          <ul className="divide-y rounded-md border">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setPicked(c.id);
                    setQuery(c.name ?? c.email ?? c.phone ?? '');
                  }}
                >
                  <span className="font-medium">{c.name ?? 'Unnamed'}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.email ?? c.phone ?? '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {query.trim() && matches.length === 0 && !picked ? (
          <p className="text-sm text-muted-foreground">
            Nobody matches. They need an account before they can be added — create one under Users.
          </p>
        ) : null}

        {pickedUser ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => addShopMember(fd));
            }}
          >
            <input type="hidden" name="shop_id" value={shopId} />
            <input type="hidden" name="profile_id" value={pickedUser.id} />

            <div>
              <Label htmlFor="member-role" className="mb-1.5">
                Here as
              </Label>
              <select
                id="member-role"
                name="role"
                className="rounded-md border bg-background px-2 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as 'shop_owner' | 'technician')}
              >
                <option value="shop_owner">Owner</option>
                <option value="technician">Technician</option>
              </select>
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : `Add ${pickedUser.name ?? 'them'}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setPicked(null);
                setQuery('');
              }}
            >
              Cancel
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
