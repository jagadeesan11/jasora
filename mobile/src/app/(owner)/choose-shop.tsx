import { router } from 'expo-router';

import { OwnerShopPicker } from '@/components/owner/owner-shop-picker';

/**
 * Changing shop after the first choice.
 *
 * The same picker the owner app shows when the shop is unsettled, reached from
 * Shop. Choosing pops back: every screen behind this one re-reads the choice.
 */
export default function ChooseShopScreen() {
  return <OwnerShopPicker onChosen={() => router.back()} />;
}
