import { resolveShop, type ShopRow } from '@/lib/current-shop';

function shop(over: Partial<ShopRow> & { id: string }): ShopRow {
  return {
    slug: over.id,
    name: `Shop ${over.id}`,
    logo_url: null,
    support_email: null,
    support_phone: null,
    address_line: null,
    city: null,
    postal_code: null,
    cod_enabled: false,
    online_payment_enabled: true,
    privacy_url: null,
    terms_url: null,
    instagram_url: null,
    whatsapp_number: null,
    is_active: true,
    latitude: null,
    longitude: null,
    service_radius_km: 100,
    concurrent_jobs: 1,
    ...over,
  };
}

const A = shop({ id: 'a' });
const B = shop({ id: 'b' });

describe('resolveShop', () => {
  it('does not ask when there is only one shop', () => {
    const { shop: chosen, mustChoose } = resolveShop([A]);
    expect(chosen?.id).toBe('a');
    expect(mustChoose).toBe(false);
  });

  it('honours a remembered choice', () => {
    const { shop: chosen, mustChoose } = resolveShop([A, B], 'b');
    expect(chosen?.id).toBe('b');
    expect(mustChoose).toBe(false);
  });

  it('asks when there are several and none was chosen', () => {
    const { shop: chosen, mustChoose, options } = resolveShop([A, B]);
    expect(chosen).toBeNull();
    expect(mustChoose).toBe(true);
    expect(options).toHaveLength(2);
  });

  it('sends the customer back to the picker when their shop is switched off', () => {
    const closed = shop({ id: 'b', is_active: false });
    const C = shop({ id: 'c' });
    const { shop: chosen, mustChoose } = resolveShop([A, closed, C], 'b');
    expect(chosen).toBeNull();
    expect(mustChoose).toBe(true);
  });

  it('falls through to the only remaining shop rather than asking', () => {
    const closed = shop({ id: 'b', is_active: false });
    const { shop: chosen, mustChoose } = resolveShop([closed, A], 'b');
    expect(chosen?.id).toBe('a');
    expect(mustChoose).toBe(false);
  });

  it('never offers a shop that is switched off', () => {
    const { options } = resolveShop([A, shop({ id: 'b', is_active: false })]);
    expect(options.map((s) => s.id)).toEqual(['a']);
  });

  it('does not ask when there is nothing to ask about', () => {
    // No shops at all is a misconfiguration, not a choice. The caller falls
    // back to its defaults rather than showing an empty picker.
    expect(resolveShop([])).toEqual({ shop: null, mustChoose: false, options: [] });
    expect(resolveShop(undefined)).toEqual({ shop: null, mustChoose: false, options: [] });
  });

  it('ignores a remembered id that matches nothing', () => {
    const { shop: chosen } = resolveShop([A], 'gone');
    expect(chosen?.id).toBe('a');
  });
});
