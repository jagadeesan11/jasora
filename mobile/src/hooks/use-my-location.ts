import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { Point } from '@/lib/distance';

export type LocationState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'ready'; point: Point }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * Where the customer is, if they will say.
 *
 * Asked for on demand rather than at launch: a permission dialog before anyone
 * has seen the app is the one most likely to be declined, and a decline is
 * remembered by the operating system.
 *
 * Accuracy.Low is a one-kilometre fix. That is ten times more precise than a
 * hundred-kilometre serviceability filter needs, and it returns far faster and
 * costs far less battery than the high settings — which matter on the phones
 * this actually runs on.
 */
export function useMyLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  // If permission was granted on a previous run there is nothing to ask, so the
  // list can sort itself without the customer doing anything.
  useEffect(() => {
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then(async ({ granted }) => {
        if (!granted || !alive) return;
        const point = await read();
        if (alive && point) setState({ status: 'ready', point });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(async () => {
    setState({ status: 'asking' });
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setState({ status: 'denied' });
        return;
      }
      const point = await read();
      setState(point ? { status: 'ready', point } : { status: 'unavailable' });
    } catch {
      // A device with location switched off, or a web browser refusing: the
      // list still works, it just cannot be sorted by distance.
      setState({ status: 'unavailable' });
    }
  }, []);

  return { ...state, request };
}

/**
 * The cached fix first, a fresh one only if there is none.
 *
 * getCurrentPositionAsync can take several seconds while the radio settles;
 * getLastKnownPositionAsync answers immediately from whatever the OS already
 * had. For sorting a list that is the right trade — a fix from ten minutes ago
 * is indistinguishable from a live one at this scale, and waiting for GPS
 * before showing anything would be worse than not sorting at all.
 */
async function read(): Promise<Point | null> {
  const last = await Location.getLastKnownPositionAsync();
  const position =
    last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  if (!position) return null;
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
