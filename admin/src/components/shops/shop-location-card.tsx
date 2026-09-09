'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { saveShopLocation } from '@/app/(dashboard)/shops/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Where this shop is, and how far it will travel.
 *
 * The pair decides whether a customer sees this shop at all: someone in Madurai
 * should not be shown a Chennai shop, because it cannot do the job. Distance is
 * how that is worked out, but the threshold belongs here rather than in the app
 * — a shop that collects vehicles genuinely serves 150km and one taking
 * walk-ins does not serve 60, and only the shop knows which it is.
 *
 * Coordinates are pasted rather than typed. Nobody knows their own latitude,
 * but anyone can find their unit on Google Maps, and the parser takes whatever
 * shape Maps hands them.
 */
export function ShopLocationCard({
  latitude,
  longitude,
  serviceRadiusKm,
}: {
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Controlled, not defaultValue. The server data arrives after this mounts —
  // and arrives again after every router.refresh() — and changing an
  // uncontrolled input's default once it is initialised is both a warning and a
  // real bug: the box would keep showing the old pin after a save.
  const [location, setLocation] = useState(
    latitude !== null && longitude !== null ? `${latitude}, ${longitude}` : '',
  );
  const [radius, setRadius] = useState(String(serviceRadiusKm));

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setMessage(null);
        startTransition(async () => {
          const result = await saveShopLocation(fd);
          setMessage({
            ok: result.ok,
            text: result.ok ? 'Saved.' : (result.message ?? 'That did not work.'),
          });
          if (result.ok) router.refresh();
        });
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">Location &amp; service range</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Customers only see shops that can actually serve them. Without a location this shop is
          still listed everywhere — it just cannot be filtered by distance.
        </p>
      </div>

      <div>
        <Label htmlFor="location" className="mb-1.5">
          Where the shop is
        </Label>
        <Input
          id="location"
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="11.9416, 79.8083"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          On Google Maps, long-press your shop until a pin drops, then copy the coordinates it
          shows — or paste the whole map link from the address bar. A shortened{' '}
          <span className="font-mono">maps.app.goo.gl</span> share link will not work: it has no
          coordinates in it.
        </p>
        {latitude !== null && longitude !== null ? (
          <a
            className="mt-1 inline-block text-xs text-primary underline"
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Check this pin on Google Maps
          </a>
        ) : null}
      </div>

      <div>
        <Label htmlFor="service_radius_km" className="mb-1.5">
          Service range (km)
        </Label>
        <Input
          id="service_radius_km"
          name="service_radius_km"
          type="number"
          min={1}
          max={1000}
          className="w-40"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          How far you will take work from. Customers further away than this will not see the shop.
          Set it to the distance you would actually travel, not the furthest you ever have.
        </p>
      </div>

      {message ? (
        <p className={message.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save location'}
      </Button>
    </form>
  );
}
