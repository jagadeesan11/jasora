import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useBusinessHours, useShopClosures } from '@/hooks/use-hours';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useTheme } from '@/hooks/use-theme';
import { openStatus, weekSchedule } from '@/lib/scheduling';

/**
 * When the shop is open, for a customer.
 *
 * The same rows the owner edits and the same rows the booking picker obeys, so
 * there is one answer to "are you open" rather than three that can drift.
 *
 * Collapsed to today by default. The full week is a reference people want
 * occasionally and a wall of text they scroll past the rest of the time.
 */
/**
 * Takes the shop as an optional prop, defaulting to the one the app is in.
 * The shop page passes its own: it is reachable by deep link, and hours for
 * whichever shop happened to be selected would be the wrong shop's.
 */
export function ShopHoursCard({ shopId: forShopId }: { shopId?: string | null } = {}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const { shopId: currentShopId } = useAppSettings();
  const shopId = forShopId ?? currentShopId;
  const { data: hours } = useBusinessHours(shopId);
  const { data: closures } = useShopClosures(shopId);

  const week = weekSchedule(hours);
  // Nothing to say until the hours arrive; an empty card is worse than none.
  if (week.length === 0) return null;

  const status = openStatus(hours, closures);

  return (
    <View style={styles.section}>
      <ThemedText type="heading">Opening hours</ThemedText>

      <Card style={styles.card}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide the full week' : 'Show the full week'}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [styles.head, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={[styles.dot, { backgroundColor: status.open ? theme.success : theme.error }]} />
          <View style={styles.headCopy}>
            <ThemedText type="bodyMedium">{status.text}</ThemedText>
            <ThemedText type="caption" themeColor="textMuted">
              {week[0].hours === 'Closed' ? 'Closed today' : `Today ${week[0].hours}`}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="primary">
            {open ? 'Hide' : 'All week'}
          </ThemedText>
        </Pressable>

        {open && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            {week.map((line) => (
              <View key={line.weekday} style={styles.row}>
                <ThemedText
                  type="small"
                  themeColor={line.isToday ? 'text' : 'textSecondary'}
                  style={styles.day}
                >
                  {line.day}
                </ThemedText>
                <ThemedText
                  type={line.isToday ? 'smallBold' : 'small'}
                  themeColor={line.hours === 'Closed' ? 'textMuted' : 'text'}
                >
                  {line.hours}
                </ThemedText>
              </View>
            ))}
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  card: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  headCopy: { flex: 1, gap: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  day: { flex: 1 },
});
