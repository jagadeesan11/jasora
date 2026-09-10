import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useTheme } from '@/hooks/use-theme';
import { initialsOf } from '@/lib/team';

/**
 * The shop's mark: its logo when one is configured, its initials when not.
 *
 * The logo is a setting rather than a bundled asset, so the same binary can
 * run a second shop without a release. That also means it can be absent, or
 * fail to load on a bad connection — hence the initials underneath rather than
 * an empty square. `onError` falls back at runtime too, because a URL that
 * once worked can stop working.
 *
 * Takes the shop as optional props so it can also render a shop that is not
 * the current one — the picker draws every shop before there is a current one
 * to read. Left off, it shows whichever shop the app is in.
 */
export function ShopAvatar({
  size = 40,
  style,
  url: urlProp,
  name: nameProp,
}: {
  size?: number;
  style?: ViewStyle;
  url?: string | null;
  name?: string;
}) {
  const theme = useTheme();
  const { settings } = useAppSettings();

  const url = urlProp !== undefined ? urlProp : settings.shop_logo_url;
  const name = nameProp ?? settings.shop_name;
  const box = {
    width: size,
    height: size,
    borderRadius: Radius.full,
  };

  if (url) {
    return (
      <View style={[box, styles.frame, { backgroundColor: theme.surfaceSunk }, style]}>
        <Image
          source={{ uri: url }}
          style={box}
          resizeMode="cover"
          accessibilityLabel={name}
        />
      </View>
    );
  }

  return (
    <View style={[box, styles.frame, { backgroundColor: theme.primary }, style]}>
      <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
        {initialsOf(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
