import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppQueryProvider } from '@/lib/query-client';
import '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

/**
 * React Navigation paints the headers and tab bar from its own theme, which
 * otherwise stays neutral black/grey while the app ground is green-black —
 * making the chrome look like it belongs to a different app. Feeding it the
 * Jasora tokens keeps the whole surface consistent.
 */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = Colors[scheme];

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.border,
    },
  };
}

function RootNavigator() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    // Covered by AnimatedSplashOverlay until auth state resolves.
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={!!session}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        {/* The shop-side app. Which group the session actually lands in is
            decided by role in app/index.tsx. */}
        <Stack.Screen name="(owner)" options={{ headerShown: false }} />
        {/* Outside the (app) tab group: NativeTabs turns every child directory
            into a tab, so sub-screens must live here to push over the tab bar. */}
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        {/* A recovery session is a real session, so this lives inside the
            signed-in guard, not with the sign-in screens. */}
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in/index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in/sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in/help" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <AppQueryProvider>
      <AuthProvider>
        <ThemeProvider value={navigationTheme(colorScheme)}>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </AppQueryProvider>
  );
}
