import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * The remembered shop, shared by every screen that asks for it.
 *
 * WHY THIS IS NOT COMPONENT STATE
 *
 * Each screen calls useShop() through its own hook instance, and useState gives
 * every instance a private copy. Choosing a shop on the home strip would move
 * the strip's own highlight and leave the catalogue below it on the previous
 * shop, because useCategories() reads a different instance. It looked correct
 * while a full-screen picker gated the tabs only because choosing there
 * remounted the whole tree and every instance re-read storage on mount.
 *
 * WHY NOT THE QUERY CACHE EITHER
 *
 * That was the first fix, and it broke the app. Calling useQueryClient() inside
 * a custom hook makes React Refresh emit a module-scope read of react-query's
 * exports; react-query exports useQueryClient through a getter over a const
 * declared further down its own module, so when this module is evaluated early
 * — and it is, being imported by the sign-in screen and the tabs layout — that
 * read lands in the temporal dead zone and throws "useQueryClient is not
 * defined" before anything renders. A store needs no library.
 *
 * AsyncStorage is the durable copy; this module holds the live one.
 */

interface ChoiceState {
  chosenId: string | null;
  ready: boolean;
}

export interface ShopChoice {
  chosenId: string | null;
  /** False until storage has been read, so nothing decides "you must pick" early. */
  ready: boolean;
  choose: (id: string) => Promise<void>;
}

export interface ShopChoiceStore {
  subscribe: (listener: () => void) => () => void;
  getChosenId: () => string | null;
  getReady: () => boolean;
  choose: (id: string) => Promise<void>;
}

/**
 * The store, separate from the hook that reads it.
 *
 * Split out because this is where the behaviour is — one value, many readers,
 * loaded once — and testing it through a rendered component would be testing
 * React instead.
 */
export function createShopChoiceStore(storageKey: string): ShopChoiceStore {
  let state: ChoiceState = { chosenId: null, ready: false };
  const listeners = new Set<() => void>();
  let loading: Promise<void> | null = null;
  // Set the moment someone picks. The load started at subscribe time can
  // resolve after that, and without this it would overwrite the fresh choice
  // with whatever storage held — so choosing a shop during the first moments of
  // a cold start would silently revert.
  let picked = false;

  function emit() {
    for (const listener of listeners) listener();
  }

  function load() {
    // Once per app run. Nothing else writes the key, so re-reading it could
    // only ever return what is already held here.
    loading ??= AsyncStorage.getItem(storageKey)
      // A device that cannot read its own preferences is not a reason to fail;
      // resolution falls through to "the only shop", or to asking.
      .catch(() => null)
      .then((value) => {
        state = { chosenId: picked ? state.chosenId : value, ready: true };
        emit();
      });
    return loading;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }

  // Read as two primitives rather than one object: useSyncExternalStore compares
  // snapshots by identity, and a fresh object every call is an infinite render.
  const getChosenId = () => state.chosenId;
  const getReady = () => state.ready;

  async function choose(id: string) {
    // Published before the write, so every screen updates on this frame rather
    // than after storage comes back.
    picked = true;
    state = { chosenId: id, ready: true };
    emit();
    try {
      await AsyncStorage.setItem(storageKey, id);
    } catch {
      // Remembered for this session even if it cannot be persisted.
    }
  }

  return { subscribe, getChosenId, getReady, choose };
}

export function createShopChoice(storageKey: string): () => ShopChoice {
  const store = createShopChoiceStore(storageKey);

  return function useShopChoice(): ShopChoice {
    const chosenId = useSyncExternalStore(store.subscribe, store.getChosenId, store.getChosenId);
    const ready = useSyncExternalStore(store.subscribe, store.getReady, store.getReady);
    // store.choose is created once with the store, so it is already stable —
    // wrapping it in useCallback would add a hook to memoise a constant.
    return { chosenId, ready, choose: store.choose };
  };
}
