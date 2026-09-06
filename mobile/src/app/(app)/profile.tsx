import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { Radius, Spacing } from '@/constants/theme';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useBookingCount, useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { settings, options } = useAppSettings();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: bookingCount } = useBookingCount(user?.id);

  const displayName = profile?.name?.trim() || 'Your account';
  const initial = (profile?.name?.trim() || user?.phone || user?.email || '?')
    .charAt(0)
    .toUpperCase();

  const location = [profile?.city, profile?.postal_code].filter(Boolean).join(' ');
  const editDetails = () => router.push('/settings/account');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
              <ThemedText type="title" style={{ color: theme.primary }}>
                {initial}
              </ThemedText>
            </View>
            <View style={styles.identityText}>
              <ThemedText type="heading">{displayName}</ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                {profile?.phone || user?.phone || user?.email || 'Signed in'}
              </ThemedText>
            </View>
          </View>

          {/* Every row routes to the editor. Read-only rows gave no hint that
              these are editable, so the edit screen was effectively hidden
              behind "Account settings". */}
          <ListGroup title="Your details">
            <ListRow first label="Name" value={profile?.name} onPress={editDetails} />
            <ListRow
              label="Phone"
              value={profile?.phone ?? user?.phone ?? null}
              onPress={editDetails}
            />
            <ListRow
              label="Email"
              value={profile?.email ?? user?.email ?? null}
              onPress={editDetails}
            />
            <ListRow label="Address" value={profile?.address_line} onPress={editDetails} />
            <ListRow label="City" value={location} onPress={editDetails} />
          </ListGroup>

          <ListGroup title="Activity">
            <ListRow
              first
              label="Order history"
              value={bookingCount === undefined ? '' : `${bookingCount}`}
              onPress={() => router.push('/(app)/bookings')}
            />
          </ListGroup>

          <ListGroup title="Settings">
            {/* Only when there is somewhere else to go. With one shop the row
                would be a control that does nothing. */}
            {options.length > 1 ? (
              <ListRow
                first
                label="Shop"
                value={settings.shop_name}
                onPress={() => router.push('/settings/shop')}
              />
            ) : null}
            <ListRow
              first={options.length <= 1}
              label="Account settings"
              onPress={() => router.push('/settings/account')}
            />
            <ListRow label="Help centre" onPress={() => router.push('/settings/help')} />
          </ListGroup>

          <ListGroup title="Legal">
            <ListRow
              first
              label="Terms and conditions"
              onPress={() => router.push('/settings/terms')}
            />
            <ListRow
              label="Privacy policy"
              onPress={() => router.push('/settings/privacy')}
            />
          </ListGroup>

          <Button label="Sign out" variant="danger" onPress={() => signOut()} style={styles.signOut} />

          <ThemedText type="caption" themeColor="textMuted" style={styles.version}>
            {settings.shop_name} v1.0.0
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 1 },
  signOut: { marginTop: Spacing.one },
  version: { textAlign: 'center' },
});
