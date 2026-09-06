import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useShop } from '@/hooks/use-app-settings';
import { useTheme } from '@/hooks/use-theme';

/**
 * Every shop open for business, on the home screen.
 *
 * The catalogue below belongs to whichever one is selected, so this is both the
 * answer to "whose services are these" and the way to change it. Tapping a shop
 * swaps the categories underneath rather than navigating — the shop is a filter
 * over home, not a place you go.
 *
 * Hidden when there is only one shop. A single-shop install has nothing to
 * choose and the strip would be a row of one, which reads as a broken carousel
 * rather than as a choice.
 */
export function ShopStrip() {
  const theme = useTheme();
  const { options, shop, choose } = useShop();

  if (options.length < 2) return null;

  return (
    <View style={styles.section}>
      <View style={styles.title}>
        <ThemedText type="label" themeColor="textMuted">
          Shops
        </ThemedText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((s) => {
          const selected = s.id === shop?.id;

          return (
            <Pressable
              key={s.id}
              onPress={() => void choose(s.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={s.name}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: selected ? theme.primarySoft : theme.surface,
                  // The selected shop is carried by border and ground together,
                  // not colour alone: on the muted card the two states differ by
                  // very little, and which shop you are booking with is not
                  // something to leave to a subtle tint.
                  borderColor: selected ? theme.primary : theme.border,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ShopAvatar url={s.logo_url} name={s.name} size={36} />
              <View style={styles.copy}>
                <ThemedText type="small" numberOfLines={1}>
                  {s.name}
                </ThemedText>
                {s.city ? (
                  <ThemedText type="caption" themeColor="textMuted" numberOfLines={1}>
                    {s.city}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  title: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  row: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  card: {
    width: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  copy: { flex: 1, gap: 1 },
});
