import { createShopChoiceStore } from '@/lib/shop-choice';

// Storage reduced to something a test can set. The `mock` prefix is what lets
// jest.mock's factory reference it.
let mockStored: string | null = null;
let mockGetFails = false;
let mockSetFails = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => {
      if (mockGetFails) throw new Error('no storage');
      return mockStored;
    },
    setItem: async (_key: string, value: string) => {
      if (mockSetFails) throw new Error('disk full');
      mockStored = value;
    },
  },
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * These cover the bug this store exists to prevent: two screens each holding
 * their own copy of the chosen shop, so picking one on the home strip moved the
 * strip's highlight and left the catalogue below it on the previous shop.
 */
describe('shop choice store', () => {
  beforeEach(() => {
    mockStored = null;
    mockGetFails = false;
    mockSetFails = false;
  });

  it('tells every subscriber about a choice, not only the one that made it', async () => {
    const store = createShopChoiceStore('test.key');
    const screenA = jest.fn();
    const screenB = jest.fn();
    store.subscribe(screenA);
    store.subscribe(screenB);

    await store.choose('shop-b');

    expect(screenA).toHaveBeenCalled();
    expect(screenB).toHaveBeenCalled();
    expect(store.getChosenId()).toBe('shop-b');
  });

  it('is not ready until storage has answered', async () => {
    mockStored = 'shop-a';
    const store = createShopChoiceStore('test.key');

    expect(store.getReady()).toBe(false);

    store.subscribe(() => undefined);
    await flush();

    expect(store.getReady()).toBe(true);
    expect(store.getChosenId()).toBe('shop-a');
  });

  it('reads storage once however many screens subscribe', async () => {
    mockStored = 'shop-a';
    const store = createShopChoiceStore('test.key');
    const seen: string[] = [];

    store.subscribe(() => seen.push('a'));
    store.subscribe(() => seen.push('b'));
    store.subscribe(() => seen.push('c'));
    await flush();

    // One load, so one notification each — not one load per subscriber.
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('resolves even when storage cannot be read', async () => {
    mockGetFails = true;
    const store = createShopChoiceStore('test.key');

    store.subscribe(() => undefined);
    await flush();

    // A device that cannot remember a preference must still settle, or the app
    // waits forever on a question it can never answer.
    expect(store.getReady()).toBe(true);
    expect(store.getChosenId()).toBeNull();
  });

  it('keeps the choice for this session even if it cannot be persisted', async () => {
    mockSetFails = true;
    const store = createShopChoiceStore('test.key');

    await store.choose('shop-c');

    expect(store.getChosenId()).toBe('shop-c');
  });

  it('stops telling a screen that has gone away', async () => {
    const store = createShopChoiceStore('test.key');
    const gone = jest.fn();
    const unsubscribe = store.subscribe(gone);
    await flush();
    gone.mockClear();

    unsubscribe();
    await store.choose('shop-d');

    expect(gone).not.toHaveBeenCalled();
  });
});
