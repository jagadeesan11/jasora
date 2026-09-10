import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useMyBookings, type BookingListItem } from '@/hooks/use-booking';
import { useTheme } from '@/hooks/use-theme';
import {
  BOOKING_STATUS_GROUPS,
  groupBookingsByStatus,
  STATUS_LABELS,
  type BookingStatusGroup,
} from '@/lib/booking-status';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const DATE = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * One state, one look.
 *
 * Confirmed, assigned and in-progress were all the same soft cyan, so the two
 * questions a customer actually has — is it booked, and has it started — had
 * the same answer on screen. Completed was grey, which reads as "nothing
 * happening" rather than "done".
 *
 * Now: amber when the customer owes something, quiet cyan while it waits, a
 * filled badge for the one job being worked on right now, green when it is
 * finished, red when it is off.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  pending_payment: 'warning',
  confirmed: 'primary',
  // Still upcoming from the customer's side — somebody is lined up, but no
  // work has started, and promoting it would blur the line that matters.
  assigned: 'primary',
  in_progress: 'active',
  completed: 'success',
  cancelled: 'error',
};

export default function BookingsScreen() {
  const { user } = useAuth();
  const { data: bookings, isLoading, isError, error, refetch } = useMyBookings(user?.id);
  const groups = groupBookingsByStatus(bookings ?? []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="display">Bookings</ThemedText>
        </View>

        {isLoading && (
          <View style={styles.body}>
            <SkeletonList count={3} height={96} />
          </View>
        )}

        {isError && (
          <View style={styles.body}>
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          </View>
        )}

        {!isLoading && !isError && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {(bookings ?? []).length === 0 ? (
              <EmptyState
                title="No bookings yet"
                description="Once you book a service it'll show up here, with live status updates."
              />
            ) : (
              BOOKING_STATUS_GROUPS.map((group) => {
                const items = groups[group];
                if (items.length === 0) return null;

                return (
                  <View key={group} style={styles.group}>
                    {/* A dot in the same colour as the badges below it, so the
                        heading and its cards read as one thing while
                        scrolling. */}
                    <View style={styles.groupHead}>
                      <GroupDot group={group} />
                      <ThemedText type="label" themeColor="textMuted">
                        {group}
                      </ThemedText>
                    </View>
                    {items.map((booking) => (
                      <BookingCard key={booking.id} booking={booking} />
                    ))}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/** The heading's colour cue, matching the badge tone of the cards under it. */
function GroupDot({ group }: { group: BookingStatusGroup }) {
  const theme = useTheme();

  const colours: Record<BookingStatusGroup, string> = {
    Upcoming: theme.primary,
    'In Progress': theme.primary,
    Completed: theme.success,
    Cancelled: theme.error,
  };

  return <View style={[styles.dot, { backgroundColor: colours[group] }]} />;
}

function BookingCard({ booking }: { booking: BookingListItem }) {
  return (
    <Card
      onPress={() =>
        router.push({ pathname: '/(app)/bookings/[bookingId]', params: { bookingId: booking.id } })
      }
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <ThemedText type="bodyMedium" style={styles.cardTitle} numberOfLines={1}>
          {booking.services?.name ?? 'Service'}
        </ThemedText>
        <Badge
          label={STATUS_LABELS[booking.status] ?? booking.status}
          tone={STATUS_TONE[booking.status] ?? 'neutral'}
        />
      </View>

      {/* Which shop is doing the work. A customer books across shops now, so
          the service name alone no longer says who has the job — and two shops
          may well sell a service by the same name. */}
      {booking.shops?.name ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {booking.shops.name}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textMuted">
        {DATE.format(new Date(booking.scheduled_at))}
      </ThemedText>

      <View style={styles.cardBottom}>
        <ThemedText type="small" themeColor="textMuted">
          {booking.technicians?.name ? `Technician · ${booking.technicians.name}` : 'Not yet assigned'}
        </ThemedText>
        <ThemedText type="price">{PRICE.format(booking.net_price)}</ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.three },
  body: { paddingHorizontal: Spacing.four },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  group: { gap: Spacing.two },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  card: { gap: Spacing.one },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
});
