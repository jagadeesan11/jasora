/**
 * Straight-line distance, and what counts as serviceable.
 *
 * Road distance would be more truthful and needs a routing API with per-request
 * billing. It is not worth it here: the question is whether a shop can take the
 * job at all, and at a hundred kilometres the gap between straight-line and
 * road distance never flips that answer. Madurai to Chennai is about 450km by
 * either measure.
 */

export interface Point {
  latitude: number;
  longitude: number;
}

/** Locatable, and willing to travel a stated distance. */
export interface ServiceableShop {
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Haversine. Accurate to a fraction of a percent over these distances, which is
 * far inside the tolerance of a filter measured in tens of kilometres.
 */
export function distanceKm(a: Point, b: Point): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far a shop is from someone, or null when that cannot be known.
 *
 * Null is a real answer rather than a failure: a shop that has not set its
 * location, or a customer who has not shared theirs, has no distance — and the
 * caller must decide what to do about that rather than being handed a zero.
 */
export function shopDistanceKm(shop: ServiceableShop, from: Point | null): number | null {
  if (!from || shop.latitude === null || shop.longitude === null) return null;
  return distanceKm(from, { latitude: shop.latitude, longitude: shop.longitude });
}

/**
 * Whether this shop can take work from where the customer is.
 *
 * Unknown counts as serviceable, deliberately, in both directions. A shop whose
 * owner has not dropped a pin yet must still appear — hiding it is revenue
 * disappearing silently, for a field nobody outside the shop can see is
 * missing. The same goes for a customer who declined location: showing
 * everything is a worse filter, not a broken app.
 */
export function isServiceable(shop: ServiceableShop, from: Point | null): boolean {
  const distance = shopDistanceKm(shop, from);
  if (distance === null) return true;
  return distance <= shop.service_radius_km;
}

/**
 * Nearest first, with unlocatable shops last rather than missing.
 *
 * Sorting is stable in every JavaScript engine this runs on, so shops that
 * cannot be measured keep the order they arrived in — alphabetical, from the
 * query.
 */
export function byDistance<T extends ServiceableShop>(shops: T[], from: Point | null): T[] {
  return [...shops].sort((a, b) => {
    const da = shopDistanceKm(a, from);
    const db = shopDistanceKm(b, from);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}

/**
 * "2.4 km" near to, "34 km" further out.
 *
 * Decimals stop being informative past a few kilometres — nobody chooses
 * between a shop 34.2km away and one at 34.8 — and they make a list harder to
 * scan.
 */
export function formatDistance(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
