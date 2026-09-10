import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useRegisterPushToken } from '@/hooks/use-register-push-token';

/**
 * The customer tabs.
 *
 * These used to sit behind a full-screen shop picker, on the reasoning that
 * everything below is scoped to one shop and so the shop had to be settled
 * first. Home lists every shop now and switching is a tap, which answers the
 * same question without a gate in front of it — and a gate is the wrong shape
 * for this anyway: someone arriving at a marketplace is choosing between
 * shops, not being stopped at the door until they commit to one.
 *
 * The picker itself still exists, reached from Profile, for changing shop
 * without going via home.
 */
export default function AppTabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  useRegisterPushToken();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bookings">
        <NativeTabs.Trigger.Label>Bookings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="event" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.fill" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
