import { Stack } from 'expo-router';

import { OwnerShopPicker } from '@/components/owner/owner-shop-picker';
import { useMyShop } from '@/hooks/use-my-shop';

/**
 * The shop-side app: a stack, with the tab bar as its first screen.
 *
 * The tabs cannot be the top of this group. NativeTabs turns every child route
 * into a tab, so a screen sitting beside `inbox` and friends is not something
 * you can push — it is a tab with no button, unreachable. That is what left
 * Shop blank and job cards dead to the touch. The customer app hit the same
 * wall and solved it the same way (see `settings` in the root layout).
 *
 * So: everything reached *from* a tab — Shop and the screens behind it, a job,
 * a bill — lives here instead, one level up, and pushes over the tab bar the
 * way the design shows.
 *
 * Screens that draw their own back control get no native header; the ones that
 * were written as tabs, and so have no way back of their own, keep one.
 */
export default function OwnerLayout() {
  const { mustChoose, isResolving, options } = useMyShop();

  // Every screen below is scoped to one shop — the inbox, the catalogue, the
  // team, the hours — so the shop is settled before any of them render. A shop
  // owner with one shop never sees this; a platform admin, who belongs to no
  // shop and administers all of them, would otherwise land on an inbox that is
  // empty for no visible reason. `options.length === 0` goes through the same
  // screen because "you are not on any shop's staff" is the same question
  // answered differently, not an error.
  if (isResolving) return null;
  if (mustChoose || options.length === 0) return <OwnerShopPicker />;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* These two draw their own back control, so they get no native header.
          Every other screen here was written as a tab and has no way back of
          its own — taking the header off them would strand you. */}
      <Stack.Screen name="shop" options={{ headerShown: false }} />
      <Stack.Screen name="job/[bookingId]" options={{ headerShown: false }} />

      <Stack.Screen name="invoice/[invoiceId]" options={{ title: 'Bill' }} />
      <Stack.Screen name="service/[serviceId]" options={{ title: 'Service' }} />
      <Stack.Screen name="team" options={{ title: 'Technicians' }} />
      <Stack.Screen name="choose-shop" options={{ title: 'Switch shop' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="invoices" options={{ title: 'Invoices' }} />
      <Stack.Screen name="hours" options={{ title: 'Hours & availability' }} />
    </Stack>
  );
}
