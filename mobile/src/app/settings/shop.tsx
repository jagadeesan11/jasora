import { router } from 'expo-router';

import { ShopPicker } from '@/components/shop-picker';

/**
 * Changing shop after the first choice.
 *
 * The same picker the app shows on first run, reached from Profile. Choosing
 * pops back rather than staying put: the choice has been made, and every
 * screen behind this one re-reads it.
 */
export default function ChangeShopScreen() {
  return <ShopPicker onChosen={() => router.back()} />;
}
