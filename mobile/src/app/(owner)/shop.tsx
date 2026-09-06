import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useBusinessHours, useShopClosures } from '@/hooks/use-hours';
import { useMyShop, useMyShops } from '@/hooks/use-my-shop';
import { useOwnerBookings } from '@/hooks/use-owner';
import { useOwnerInvoices } from '@/hooks/use-owner-invoices';
import { useReportBookings } from '@/hooks/use-owner-reports';
import { useTeam } from '@/hooks/use-owner-team';
import { useTheme } from '@/hooks/use-theme';
import { isSettled } from '@/lib/invoices';
import { inTheBay, todaysBookings } from '@/lib/owner-board';
import { periodBounds, summarise, withinPeriod } from '@/lib/reports';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function prettyTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Everything the shop is, as opposed to everything it is doing today.
 *
 * This is the hub the tab bar gave up carrying: team, money, bills and hours
 * are all things an owner sets up now and then, so they sit one tap behind the
 * board rather than competing with it for a tab.
 *
 * Every row shows the number you would have opened it to find, so the common
 * case — "how much this month", "anyone free" — is answered without leaving.
 */
export default function OwnerShopScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  // The shop being managed. Deliberately not useAppSettings(), which resolves
  // the shop this person books with as a customer — the same thing while they
  // run one shop, and the wrong one as soon as they run two.
  const { shop: managed } = useMyShop();

  const team = useTeam();
  const bookings = useOwnerBookings();
  const invoices = useOwnerInvoices();
  const reports = useReportBookings();
  const shopId = managed?.id ?? null;
  const { data: myShops = [] } = useMyShops();
  const hours = useBusinessHours(shopId);
  const closures = useShopClosures(shopId);

  const monthToDate = useMemo(() => {
    const { from, to } = periodBounds('Month');
    return summarise((reports.data ?? []).filter((r) => withinPeriod(r, from, to)));
  }, [reports.data]);

  const busyNow = useMemo(
    () => inTheBay(todaysBookings(bookings.data)).filter((b) => b.status === 'in_progress').length,
    [bookings.data],
  );

  const unpaid = useMemo(
    () => (invoices.data ?? []).filter((i) => !isSettled(i)).length,
    [invoices.data],
  );

  const thisMonth = useMemo(() => {
    const { from, to } = periodBounds('Month');
    return (invoices.data ?? []).filter((i) => {
      const at = new Date(i.issued_at);
      return at >= from && at <= to;
    }).length;
  }, [invoices.data]);

  // "Mon–Sat" style summary rather than seven rows: the exceptions are what
  // matter here, and the full grid is one tap away.
  const openDays = (hours.data ?? []).filter((h) => h.is_open).map((h) => DAY_SHORT[h.weekday]);
  const daysLine =
    openDays.length === 0
      ? 'Not set up yet'
      : openDays.length === 7
        ? 'Open every day'
        : `${openDays[0]}–${openDays[openDays.length - 1]}`;
  const blocked = (closures.data ?? []).length;

  const today = (hours.data ?? []).find((h) => h.weekday === new Date().getDay());
  const openLine = today?.is_open
    ? `Open till ${prettyTime(today.closes_at)}`
    : hours.data && hours.data.length > 0
      ? 'Closed today'
      : null;

  const people = (team.data ?? []).length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={({ pressed }) => [
                styles.back,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText type="bodyMedium">←</ThemedText>
            </Pressable>
            <ThemedText type="title">Shop</ThemedText>
          </View>

          <View style={styles.body}>
            <Card style={styles.identity}>
              <ShopAvatar url={managed?.logo_url ?? null} name={managed?.name} size={44} />
              <View style={styles.identityCopy}>
                <ThemedText type="bodyMedium" numberOfLines={1}>
                  {managed?.name ?? 'Shop'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {[managed?.city, openLine].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
            </Card>
          </View>

          <View style={styles.group}>
            <Row
              title="Technicians"
              subtitle={
                people === 0
                  ? 'Nobody on the team yet'
                  : `${people} ${people === 1 ? 'person' : 'people'}${busyNow > 0 ? ` · ${busyNow} in a bay now` : ''}`
              }
              onPress={() => router.push('/(owner)/team')}
              first
            />
            {/* Earnings and Reports open the same screen: it already carries
                revenue alongside jobs and ratings. Earnings keeps its own row
                because the month-to-date figure is the thing most often wanted,
                and putting it here answers the question without the tap. */}
            <Row
              title="Earnings"
              subtitle={`Month to date ${PRICE.format(monthToDate.revenue)}`}
              onPress={() => router.push('/(owner)/reports')}
            />
            <Row
              title="Reports"
              subtitle="Revenue, jobs and ratings"
              onPress={() => router.push('/(owner)/reports')}
            />
            <Row
              title="Invoices"
              subtitle={`${unpaid} unpaid · ${thisMonth} this month`}
              onPress={() => router.push('/(owner)/invoices')}
            />
            <Row
              title="Hours & availability"
              subtitle={`${daysLine}${blocked > 0 ? ` · ${blocked} day${blocked === 1 ? '' : 's'} blocked` : ''}`}
              onPress={() => router.push('/(owner)/hours')}
              last={myShops.length < 2}
            />
            {/* Only for someone who runs more than one. With a single shop this
                would be a control that changes nothing, and the picker it opens
                would have one option. */}
            {myShops.length > 1 ? (
              <Row
                title="Switch shop"
                subtitle={`Managing ${managed?.name ?? 'Shop'}`}
                onPress={() => router.push('/(owner)/choose-shop')}
                last
              />
            ) : null}
          </View>

          <View style={styles.body}>
            <Card
              onPress={() => void signOut()}
              style={[styles.signOut, { borderColor: theme.border }]}
            >
              <ThemedText type="bodyMedium" themeColor="error">
                Sign out
              </ThemedText>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Row({
  title,
  subtitle,
  onPress,
  first,
  last,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          // One card made of rows, rather than a stack of separate cards: the
          // divider between them is the hairline, and only the ends are round.
          borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
          borderTopLeftRadius: first ? Radius.lg : 0,
          borderTopRightRadius: first ? Radius.lg : 0,
          borderBottomLeftRadius: last ? Radius.lg : 0,
          borderBottomRightRadius: last ? Radius.lg : 0,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.rowCopy}>
        <ThemedText type="bodyMedium">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <ThemedText type="body" themeColor="textMuted">
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { paddingBottom: Spacing.six },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: { flex: 1, gap: 2 },
  group: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  rowCopy: { flex: 1, gap: 2 },
  signOut: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
