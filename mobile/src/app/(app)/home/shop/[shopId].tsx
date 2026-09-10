import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { CategoryCard } from '@/components/home/category-card';
import { QuickActions } from '@/components/home/quick-actions';
import { ShopAvatar } from '@/components/shop-avatar';
import { ShopHoursCard } from '@/components/shop-hours-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Spacing } from '@/constants/theme';
import { useShops } from '@/hooks/use-app-settings';
import { useCategories } from '@/hooks/use-catalog';

/**
 * One shop: who they are, when they are open, and what they do.
 *
 * The screen home used to be, minus the guessing. Its shop comes from the route
 * rather than from whatever is selected, so a deep link lands on the right shop
 * on the first render — tapping a card selects it too, but this does not depend
 * on that having happened.
 */
export default function ShopScreen() {
  const { shopId } = useLocalSearchParams<{ shopId: string }>();

  const { data: shops, isLoading: shopsLoading } = useShops();
  const shop = useMemo(() => shops?.find((s) => s.id === shopId) ?? null, [shops, shopId]);

  const { data: categories, isLoading, isError, error, refetch } = useCategories(shopId);

  const address = [shop?.address_line, shop?.city, shop?.postal_code].filter(Boolean).join(', ');

  const header = (
    <>
      <View style={styles.identity}>
        <ShopAvatar url={shop?.logo_url ?? null} name={shop?.name} size={64} />
        <View style={styles.identityCopy}>
          <ThemedText type="title" numberOfLines={2}>
            {shop?.name ?? 'Shop'}
          </ThemedText>
          {address ? (
            <ThemedText type="small" themeColor="textMuted">
              {address}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {/* WhatsApp, phone, Instagram and help — only the channels this shop has
          actually configured, so the row never offers one that goes nowhere. */}
      <QuickActions shopId={shopId} />

      {/* When they are staffed. Information, not a booking limit — a slot
          outside these can still be requested and the shop decides. */}
      <View style={styles.hours}>
        <ShopHoursCard shopId={shopId} />
      </View>

      <View style={styles.sectionTitle}>
        <ThemedText type="label" themeColor="textMuted">
          Browse
        </ThemedText>
      </View>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={isLoading || isError ? [] : categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.body}>
            {isLoading || shopsLoading ? (
              <SkeletonList count={3} height={76} />
            ) : isError ? (
              <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
            ) : (
              <EmptyState
                title="Nothing to book yet"
                description="This shop hasn't published any services."
              />
            )}
          </View>
        }
        renderItem={({ item }) => <CategoryCard category={item} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  identityCopy: { flex: 1, gap: Spacing.one },
  hours: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  sectionTitle: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  list: { paddingBottom: Spacing.six, gap: Spacing.two },
});
