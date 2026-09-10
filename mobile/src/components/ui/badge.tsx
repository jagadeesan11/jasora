import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type BadgeTone = 'neutral' | 'primary' | 'active' | 'success' | 'warning' | 'error';

/**
 * `active` is the only filled tone, and that is the point.
 *
 * A booking's states used to be told apart by hue alone, which left the two
 * that matter most — waiting and happening — the same soft cyan. Weight
 * separates them where a second shade of the same colour would not: the job
 * being worked on right now is the one thing on the screen with a solid
 * ground, so it is found without reading anything.
 *
 * It also keeps the distinction legible to someone who cannot easily
 * distinguish the hues, which colour alone never does.
 */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();

  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.surfaceSunk, fg: theme.textSecondary },
    primary: { bg: theme.primarySoft, fg: theme.primary },
    active: { bg: theme.primary, fg: theme.primaryText },
    success: { bg: theme.successSoft, fg: theme.success },
    warning: { bg: theme.warningSoft, fg: theme.warning },
    error: { bg: theme.errorSoft, fg: theme.error },
  };
  const { bg, fg } = tones[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <ThemedText type="caption" style={{ color: fg }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
});
