import { Stack } from 'expo-router';

export default function SettingsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="account" options={{ title: 'Account settings' }} />
      <Stack.Screen name="help" options={{ title: 'Help centre' }} />
      <Stack.Screen name="terms" options={{ title: 'Terms and conditions' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
    </Stack>
  );
}
