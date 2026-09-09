import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import type { LocationState } from '@/hooks/use-my-location';

/**
 * The prompt that turns the listing into a local one.
 *
 * Shown as an offer, not a gate. Every state below still leaves a usable list
 * of shops behind it — declining, switching location off, or being on a device
 * that cannot answer all fall back to showing everything, because a shorter
 * list is a better filter and an empty one is a broken app.
 */
export function NearMe({
  state,
  onRequest,
  hiddenCount,
}: {
  state: LocationState['status'];
  onRequest: () => void;
  /** Shops filtered out as too far — worth naming so the list is not a mystery. */
  hiddenCount: number;
}) {
  if (state === 'ready') {
    if (hiddenCount === 0) return null;
    return (
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textMuted">
          Showing shops that can reach you.{' '}
          {hiddenCount === 1 ? '1 shop is' : `${hiddenCount} shops are`} too far away.
        </ThemedText>
      </View>
    );
  }

  if (state === 'denied' || state === 'unavailable') {
    // Not an error, and not worth a retry button: they said no, or the device
    // cannot. Say what that means for the list and leave it alone.
    return (
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textMuted">
          Showing every shop. Turn on location to see only the ones that can reach you.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.prompt}>
      <View style={styles.copy}>
        <ThemedText type="small" themeColor="textSecondary">
          See only shops that can serve your area
        </ThemedText>
      </View>
      <Button
        label={state === 'asking' ? 'Checking…' : 'Near me'}
        variant="secondary"
        onPress={onRequest}
        disabled={state === 'asking'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  copy: { flex: 1 },
  note: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
});
