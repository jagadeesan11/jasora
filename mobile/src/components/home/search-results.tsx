import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ServiceIcon } from '@/components/service-icon';
import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { SERVICE_ICONS } from '@/constants/service-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useShop } from '@/hooks/use-app-settings';
import { useSearch, type SearchHit } from '@/hooks/use-search';
import { useTheme } from '@/hooks/use-theme';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * What a search turns up, across every shop.
 *
 * Choosing a result settles the shop as a side effect: the catalogue, prices
 * and hours behind it all belong to one shop, so opening a service from another
 * shop has to switch to that shop or the screen would show one shop's service
 * with another shop's everything else. That is why each service row names its
 * shop — the switch should not be a surprise.
 */
export function SearchResults({ query }: { query: string }) {
  const { data, isLoading, isError, error, refetch } = useSearch(query);

  if (isLoading) return <SkeletonList count={4} height={68} />;
  if (isError) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={`Nothing matches “${query.trim()}”`}
        description="Try a shorter word, or the name of a shop."
      />
    );
  }

  return (
    <View style={styles.list}>
      {data.map((hit) => (
        <Hit key={`${hit.kind}-${hit.id}`} hit={hit} />
      ))}
    </View>
  );
}

function Hit({ hit }: { hit: SearchHit }) {
  const theme = useTheme();
  const { choose } = useShop();

  if (hit.kind === 'shop') {
    return (
      <Card
        onPress={() => void choose(hit.id)}
        style={styles.card}
        accessibilityLabel={`${hit.name}, shop`}
      >
        <ShopAvatar url={hit.logo_url} name={hit.name} size={44} />
        <View style={styles.body}>
          <ThemedText type="bodyMedium" numberOfLines={1}>
            {hit.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
            {hit.city ? `Shop · ${hit.city}` : 'Shop'}
          </ThemedText>
        </View>
        <ThemedText type="body" themeColor="textMuted">
          ›
        </ThemedText>
      </Card>
    );
  }

  return (
    <Card
      onPress={() => {
        // The shop first, then the service. Both screens behind this read the
        // selected shop, so switching after navigating would render the new
        // service against the old shop for a frame.
        void choose(hit.shop_id);
        router.push({
          pathname: '/(app)/home/service/[serviceId]',
          params: { serviceId: hit.id },
        });
      }}
      style={styles.card}
      accessibilityLabel={`${hit.name} at ${hit.shopName}`}
    >
      <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
        {SERVICE_ICONS[hit.icon ?? ''] ? (
          <ServiceIcon name={hit.icon} size={24} />
        ) : (
          <ThemedText type="bodyMedium" style={{ color: theme.primary }}>
            {hit.name.charAt(0).toUpperCase()}
          </ThemedText>
        )}
      </View>

      <View style={styles.body}>
        <ThemedText type="bodyMedium" numberOfLines={1}>
          {hit.name}
        </ThemedText>
        {/* Named on every service row: two shops may sell the same thing, and
            opening this one changes which shop the app is in. */}
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
          {hit.shopName}
        </ThemedText>
      </View>

      <ThemedText type="price">{PRICE.format(hit.base_price)}</ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 1 },
});
