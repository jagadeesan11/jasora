import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useMyBookings, type BookingListItem } from '@/hooks/use-booking';
import { BOOKING_STATUS_GROUPS, groupBookingsByStatus, STATUS_LABELS } from '@/lib/booking-status';

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

const STATUS_TONE: Record<string, BadgeTone> = {
  pending_payment: 'warning',
  confirmed: 'primary',
  assigned: 'primary',
  in_progress: 'primary',
  completed: 'neutral',
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
                    <ThemedText type="label" themeColor="textMuted">
                      {group}
                    </ThemedText>
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
