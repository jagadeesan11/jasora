import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useShop } from '@/hooks/use-app-settings';
import type { ShopRow } from '@/lib/current-shop';
import { formatDistance, shopDistanceKm, type Point } from '@/lib/distance';

/**
 * One shop in the home listing.
 *
 * Tapping opens the shop rather than switching to it in place. The difference
 * matters: a strip of chips that swapped the catalogue underneath gave no sense
 * of having gone anywhere, and no room for anything about the shop itself —
 * where it is, when it is open, how to reach it. A shop is a place you go into.
 *
 * It still becomes the selected shop on the way, because the booking flow
 * behind it reads one shop for hours, prices and payment methods. That is a
 * side effect of opening it, not the whole of what the tap does.
 */
export function ShopCard({ shop, distanceFrom }: { shop: ShopRow; distanceFrom?: Point | null }) {
  const { choose } = useShop();

  // Null whenever either side is unknown, which is a real answer rather than a
  // zero: a shop with no pin simply has no distance to show.
  const away = shopDistanceKm(shop, distanceFrom ?? null);

  return (
    <Card
      onPress={() => {
        void choose(shop.id);
        router.push({ pathname: '/(app)/home/shop/[shopId]', params: { shopId: shop.id } });
      }}
      style={styles.card}
      accessibilityLabel={shop.name}
    >
      <ShopAvatar url={shop.logo_url} name={shop.name} size={52} />

      <View style={styles.body}>
        <ThemedText type="bodyMedium" numberOfLines={1}>
          {shop.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
          {[shop.city, shop.address_line].filter(Boolean).join(' · ') || 'Tap to see what they do'}
        </ThemedText>
      </View>

      {away !== null ? (
        <ThemedText type="small" themeColor="textMuted">
          {formatDistance(away)}
        </ThemedText>
      ) : (
        <ThemedText type="body" themeColor="textMuted">
          ›
        </ThemedText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
  },
  body: { flex: 1, gap: 2 },
});
