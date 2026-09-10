import { Stack } from 'expo-router';

export default function HomeStackLayout() {
  return (
    <Stack>
      {/* No header: the screen has its own headline and handles the top
          inset itself, so a bar saying 'Home' under a tab saying 'Home' is
          duplication that costs vertical space. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Titles are set by the screens themselves, from the category and
          service they loaded — 'Services' and 'Service' told the customer
          nothing about where they were. */}
      <Stack.Screen name="shop/[shopId]" options={{ title: 'Shop' }} />
      <Stack.Screen name="[categoryId]" />
      <Stack.Screen name="service/[serviceId]" />
      <Stack.Screen name="booking/asset" options={{ title: 'Job details' }} />
      <Stack.Screen name="booking/details" options={{ title: 'Address & contact' }} />
      <Stack.Screen name="booking/confirm" options={{ title: 'Schedule' }} />
      <Stack.Screen name="booking/payment" options={{ title: 'Payment', headerBackVisible: false }} />
    </Stack>
  );
}
