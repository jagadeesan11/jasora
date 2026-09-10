import {
  byDistance,
  distanceKm,
  formatDistance,
  isServiceable,
  shopDistanceKm,
  type ServiceableShop,
} from '@/lib/distance';

// Real places, so the numbers can be checked against a map rather than against
// whatever this implementation happens to produce.
const PONDICHERRY = { latitude: 11.9416, longitude: 79.8083 };
const VILLUPURAM = { latitude: 11.9401, longitude: 79.4861 };
const CHENNAI = { latitude: 13.0827, longitude: 80.2707 };
const MADURAI = { latitude: 9.9252, longitude: 78.1198 };

function shop(over: Partial<ServiceableShop> = {}): ServiceableShop {
  return { latitude: PONDICHERRY.latitude, longitude: PONDICHERRY.longitude, service_radius_km: 100, ...over };
}

describe('distanceKm', () => {
  it('is zero from a place to itself', () => {
    expect(distanceKm(PONDICHERRY, PONDICHERRY)).toBe(0);
  });

  it('matches the real distance between two known cities', () => {
    // Pondicherry to Chennai is about 135km as the crow flies.
    expect(distanceKm(PONDICHERRY, CHENNAI)).toBeGreaterThan(125);
    expect(distanceKm(PONDICHERRY, CHENNAI)).toBeLessThan(145);

    // Pondicherry to Madurai is about 290km straight-line — roughly 224km of
    // latitude and 184km of longitude at this latitude. Road distance is quoted
    // higher, which is why the two are worth not confusing.
    expect(distanceKm(PONDICHERRY, MADURAI)).toBeGreaterThan(280);
    expect(distanceKm(PONDICHERRY, MADURAI)).toBeLessThan(300);
  });

  it('does not care which way round the two places are given', () => {
    expect(distanceKm(PONDICHERRY, CHENNAI)).toBeCloseTo(distanceKm(CHENNAI, PONDICHERRY), 6);
  });
});

/**
 * The case this feature exists for: a customer in Madurai must not be offered a
 * shop that cannot reach them, and one nearby must not be hidden.
 */
describe('isServiceable', () => {
  const pondicherryShop = shop({ service_radius_km: 100 });

  it('keeps a shop within its stated range', () => {
    expect(isServiceable(pondicherryShop, VILLUPURAM)).toBe(true);
  });

  it('drops a shop that cannot reach the customer', () => {
    expect(isServiceable(pondicherryShop, MADURAI)).toBe(false);
  });

  it('respects a range the shop widened', () => {
    // 135km away: outside the default, inside a shop that travels 150.
    expect(isServiceable(shop({ service_radius_km: 100 }), CHENNAI)).toBe(false);
    expect(isServiceable(shop({ service_radius_km: 150 }), CHENNAI)).toBe(true);
  });

  it('keeps a shop that has not set its location', () => {
    // Hiding it would be revenue disappearing because of a field the customer
    // cannot see is missing.
    expect(isServiceable(shop({ latitude: null, longitude: null }), MADURAI)).toBe(true);
  });

  it('keeps every shop when the customer has no location', () => {
    expect(isServiceable(pondicherryShop, null)).toBe(true);
  });
});

describe('byDistance', () => {
  it('puts the nearest shop first', () => {
    const near = { ...shop(), id: 'pondicherry' };
    const far = { ...shop({ latitude: CHENNAI.latitude, longitude: CHENNAI.longitude }), id: 'chennai' };

    expect(byDistance([far, near], VILLUPURAM).map((s) => s.id)).toEqual([
      'pondicherry',
      'chennai',
    ]);
  });

  it('puts shops with no location last rather than dropping them', () => {
    const located = { ...shop(), id: 'located' };
    const unlocated = { ...shop({ latitude: null, longitude: null }), id: 'unlocated' };

    expect(byDistance([unlocated, located], VILLUPURAM).map((s) => s.id)).toEqual([
      'located',
      'unlocated',
    ]);
  });

  it('leaves the given order alone when nobody can be measured', () => {
    const a = { ...shop({ latitude: null, longitude: null }), id: 'a' };
    const b = { ...shop({ latitude: null, longitude: null }), id: 'b' };
    expect(byDistance([a, b], null).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('does not mutate what it was given', () => {
    const shops = [
      { ...shop({ latitude: CHENNAI.latitude, longitude: CHENNAI.longitude }), id: 'chennai' },
      { ...shop(), id: 'pondicherry' },
    ];
    byDistance(shops, VILLUPURAM);
    expect(shops.map((s) => s.id)).toEqual(['chennai', 'pondicherry']);
  });
});

describe('shopDistanceKm', () => {
  it('has no answer when either side is unknown', () => {
    expect(shopDistanceKm(shop(), null)).toBeNull();
    expect(shopDistanceKm(shop({ latitude: null, longitude: null }), MADURAI)).toBeNull();
  });
});

describe('formatDistance', () => {
  it('keeps a decimal close by and drops it further out', () => {
    expect(formatDistance(2.44)).toBe('2.4 km');
    expect(formatDistance(34.6)).toBe('35 km');
  });
});
