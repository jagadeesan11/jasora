import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvoiceCard } from '@/components/invoice-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingScreen } from '@/components/ui/feedback';
import { Radius, Spacing } from '@/constants/theme';
import { useBooking, useCancelBooking } from '@/hooks/use-booking';
import { useBookingFeedback } from '@/hooks/use-feedback';
import { useTheme } from '@/hooks/use-theme';
import {
  BOOKING_TIMELINE_STATUSES,
  STATUS_LABELS,
  canCustomerCancel,
  isLateCancellation,
} from '@/lib/booking-status';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const DATE = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: booking, isLoading, isError, refetch } = useBooking(bookingId);
  const { data: feedback } = useBookingFeedback(bookingId);
  const cancelBooking = useCancelBooking();
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function runCancel() {
    setCancelError(null);
    try {
      await cancelBooking.mutateAsync(bookingId);
      await refetch();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel. Please contact us.');
    }
  }

  function handleCancel() {
    const title = `Cancel your ${booking?.services?.name ?? 'booking'}?`;
    const body = 'We will not send a technician, and your slot is released. This cannot be undone.';

    // react-native-web does not implement Alert.alert's button list, so on web
    // the dialog would never appear and the button would look dead. Same
    // confirmation either way, just through the API each platform has.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${body}`)) void runCancel();
      return;
    }

    Alert.alert(title, body, [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => void runCancel() },
    ]);
  }

  if (isLoading) return <LoadingScreen />;

  if (isError || !booking) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.errorArea} edges={['left', 'right', 'bottom']}>
          <ErrorState message="Could not load this booking." onRetry={() => refetch()} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const cancelled = booking.status === 'cancelled';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <ThemedText type="title">{booking.services?.name ?? 'Service'}</ThemedText>
            <ThemedText type="body" themeColor="textSecondary">
              {DATE.format(new Date(booking.scheduled_at))}
            </ThemedText>
          </View>

          <Card style={styles.summary}>
            {/* Who is doing the work. Above the status because it is the thing
                a customer needs when something is wrong with the job and they
                are deciding who to call. */}
            {booking.shops?.name && <SummaryRow label="Shop" value={booking.shops.name} />}
            <SummaryRow label="Status" value={STATUS_LABELS[booking.status] ?? booking.status} />
            {booking.technicians?.name && (
              <SummaryRow label="Technician" value={booking.technicians.name} />
            )}
            {/* Both figures, and only when there is a discount: a customer who
                was given money off should be able to see it was given, not
                just a smaller number they cannot account for. */}
            {booking.discount_amount + booking.promo_discount_amount > 0 && (
              <>
                <SummaryRow label="Service" value={PRICE.format(booking.total_price)} />
                {booking.promo_discount_amount > 0 && (
                  <SummaryRow
                    label={
                      booking.promo_codes?.code
                        ? `Promo code ${booking.promo_codes.code}`
                        : 'Promo code'
                    }
                    value={`− ${PRICE.format(booking.promo_discount_amount)}`}
                  />
                )}
                {booking.discount_amount > 0 && (
                  <SummaryRow
                    label={booking.discount_reason || 'Discount'}
                    value={`− ${PRICE.format(booking.discount_amount)}`}
                  />
                )}
              </>
            )}
            <SummaryRow label="Total" value={PRICE.format(booking.net_price)} emphasis />
          </Card>

          {/* Only once the work is actually done, and only until they have
              had their say — an unanswered prompt that never goes away reads
              as nagging. */}
          {booking.status === 'completed' && (
            <Card style={styles.summary}>
              <ThemedText type="bodyMedium">
                {feedback ? 'You rated this service' : 'How did we do?'}
              </ThemedText>
              {feedback ? (
                <ThemedText type="body" themeColor="textSecondary">
                  {'★'.repeat(feedback.rating)}
                  <ThemedText themeColor="textMuted">{'★'.repeat(5 - feedback.rating)}</ThemedText>
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textMuted">
                  A few seconds of your time tells us who to send next.
                </ThemedText>
              )}
              <Button
                label={feedback ? 'View your review' : 'Rate this service'}
                variant={feedback ? 'secondary' : 'primary'}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/bookings/feedback/[bookingId]',
                    params: { bookingId: booking.id },
                  })
                }
              />
            </Card>
          )}

          <InvoiceCard bookingId={booking.id} />

          {canCustomerCancel(booking.status) && (
            <View style={styles.cancelSection}>
              {/* The fee comes from the terms, not from the app — so this warns
                  rather than charges, and says who to talk to. */}
              {isLateCancellation(booking.scheduled_at) && (
                <ThemedText type="small" themeColor="textMuted">
                  This slot is less than 24 hours away. Cancelling now may incur a charge under our
                  terms — get in touch if something has come up and we&apos;ll sort it out.
                </ThemedText>
              )}
              <Button
                label={cancelBooking.isPending ? 'Cancelling…' : 'Cancel this booking'}
                variant="danger"
                loading={cancelBooking.isPending}
                onPress={handleCancel}
              />
              {cancelError && (
                <ThemedText type="small" themeColor="error">
                  {cancelError}
                </ThemedText>
              )}
            </View>
          )}

          <View style={styles.timelineSection}>
            <ThemedText type="heading">Progress</ThemedText>
            {cancelled ? (
              <Badge label="This booking was cancelled" tone="error" />
            ) : (
              <StatusTimeline currentStatus={booking.status} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SummaryRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <ThemedText type={emphasis ? 'price' : 'smallBold'}>{value}</ThemedText>
    </View>
  );
}

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const theme = useTheme();
  const currentIndex = BOOKING_TIMELINE_STATUSES.indexOf(
    currentStatus as (typeof BOOKING_TIMELINE_STATUSES)[number],
  );

  return (
    <View>
      {BOOKING_TIMELINE_STATUSES.map((status, index) => {
        const done = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === BOOKING_TIMELINE_STATUSES.length - 1;

        return (
          <View key={status} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: done ? theme.primary : theme.surface,
                    borderColor: done ? theme.primary : theme.border,
                  },
                  isCurrent && styles.dotCurrent,
                ]}
              />
              {/* Connector is drawn per-step rather than as one bar so each
                  completed segment can be filled independently. */}
              {!isLast && (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: index < currentIndex ? theme.primary : theme.border },
                  ]}
                />
              )}
            </View>

            <View style={styles.timelineLabel}>
              <ThemedText
                type={isCurrent ? 'bodyMedium' : 'body'}
                themeColor={done ? 'text' : 'textMuted'}
              >
                {STATUS_LABELS[status]}
              </ThemedText>
              {isCurrent && (
                <ThemedText type="caption" themeColor="primary">
                  Current
                </ThemedText>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  errorArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  head: { gap: Spacing.one },
  summary: { gap: Spacing.two },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineSection: { gap: Spacing.three },
  cancelSection: { gap: Spacing.two },
  timelineRow: { flexDirection: 'row', gap: Spacing.three },
  timelineRail: { alignItems: 'center', width: 16 },
  dot: { width: 14, height: 14, borderRadius: Radius.full, borderWidth: 2 },
  dotCurrent: { transform: [{ scale: 1.25 }] },
  connector: { width: 2, flex: 1, minHeight: 26 },
  timelineLabel: { flex: 1, paddingBottom: Spacing.four, gap: 1 },
});
