import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveBookingCard } from '@/components/home/active-booking-card';
import { HomeHeader } from '@/components/home/home-header';
import { NearMe } from '@/components/home/near-me';
import { SearchField } from '@/components/home/search-field';
import { SearchResults } from '@/components/home/search-results';
import { ShopCard } from '@/components/home/shop-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Spacing } from '@/constants/theme';
import { useShop } from '@/hooks/use-app-settings';
import { useMyLocation } from '@/hooks/use-my-location';
import { byDistance, isServiceable } from '@/lib/distance';

/**
 * Home is the list of shops.
 *
 * It used to be one shop's categories, with a strip of chips above them that
 * swapped which shop that was. That reads as a filter rather than a place — you
 * never went anywhere, so there was nowhere to put anything about the shop
 * itself: its address, its hours, how to reach it. Home now answers "who is
 * there", and the shop page answers "what do they do".
 */
export default function HomeScreen() {
  const { options, isLoading, isError, error, refetch } = useShop();
  const [search, setSearch] = useState('');
  // Two characters, matching the hook: below that the results are noise, so the
  // listing stays put rather than flashing away on the first letter.
  const searching = search.trim().length >= 2;
  const location = useMyLocation();
  const here = location.status === 'ready' ? location.point : null;

  // Serviceable first, then nearest. A shop with no pin, and a customer who
  // has not shared one, both count as serviceable — the filter narrows the
  // list where it can and never empties it.
  const shops = useMemo(() => byDistance((options ?? []).filter((s) => isServiceable(s, here)), here), [options, here]);
  const hidden = (options?.length ?? 0) - shops.length;

  // Header, live booking and actions ride in ListHeaderComponent rather than
  // sitting above the list: pinned, they would eat most of a small screen
  // before a single shop was visible.
  const header = (
    <>
      <HomeHeader />
      <SearchField value={search} onChange={setSearch} />

      {searching ? (
        <View style={styles.searchResults}>
          <SearchResults query={search} />
        </View>
      ) : (
        <>
          <ActiveBookingCard />
          <NearMe state={location.status} onRequest={location.request} hiddenCount={hidden} />
          <View style={styles.sectionTitle}>
            <ThemedText type="label" themeColor="textMuted">
              Shops
            </ThemedText>
          </View>
        </>
      )}
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          // Empty while searching, loading or failed, so the header still
          // renders and the state lands in ListEmptyComponent instead of three
          // parallel branches.
          data={searching || isLoading || isError ? [] : shops}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.body}>
              {searching ? null : isLoading ? (
                <SkeletonList count={3} height={84} />
              ) : isError ? (
                <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
              ) : hidden > 0 ? (
                // Filtered to nothing rather than empty. Naming the reason keeps
                // a customer outside every shop's range from concluding the app
                // is broken or the platform has no shops.
                <EmptyState
                  title="No shops reach your area yet"
                  description={
                    hidden === 1
                      ? 'The one shop we have is too far away to serve you. We will add more.'
                      : `All ${hidden} shops are too far away to serve you. We will add more.`
                  }
                />
              ) : (
                <EmptyState
                  title="No shops yet"
                  description="Shops appear here as they open. Check back shortly."
                />
              )}
            </View>
          }
          renderItem={({ item }) => <ShopCard shop={item} distanceFrom={here} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  sectionTitle: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  searchResults: { paddingTop: Spacing.four },
  // No horizontal padding here: the header pieces pad themselves, so padding
  // the container as well would double it for them.
  list: { paddingBottom: Spacing.six, gap: Spacing.two },
});
