import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssignSheet } from '@/components/owner/assign-sheet';
import { StatusChip } from '@/components/owner/status-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingScreen } from '@/components/ui/feedback';
import { Radius, Spacing } from '@/constants/theme';
import {
  useCollectCash,
  useOwnerBooking,
  useTechnicians,
  useUpdateBooking,

} from '@/hooks/use-owner';
import { useTheme } from '@/hooks/use-theme';
import { BOOKING_TIMELINE_STATUSES, STATUS_LABELS } from '@/lib/booking-status';
import { isSameDay, jobActivity, nextAction, statusTone } from '@/lib/owner-board';
import { initialsOf } from '@/lib/team';
import { vehicleFuel, vehicleLabel, vehicleRegistration, vehicleSize } from '@/lib/vehicle';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const WHEN = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const SLOT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** "Today, 7:10 am" for anything from today, the date otherwise. */
function stampOf(at: Date): string {
  const time = SLOT.format(at);
  return isSameDay(at.toISOString()) ? `Today, ${time}` : `${DAY.format(at)}, ${time}`;
}

export default function OwnerJobScreen() {
  const theme = useTheme();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: job, isLoading, isError, error, refetch } = useOwnerBooking(bookingId);
  const { data: technicians } = useTechnicians();
  const update = useUpdateBooking();
  const collect = useCollectCash();

  const [assigning, setAssigning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (isLoading) return <LoadingScreen />;

  if (isError || !job) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centre} edges={['left', 'right', 'bottom']}>
          <ErrorState
            message={isError ? (error as Error).message : 'That job could not be found.'}
            onRetry={() => refetch()}
          />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const action = nextAction(job);
  const customer = job.contact_name || job.profiles?.name || 'Unnamed customer';
  const phone = job.contact_phone || job.profiles?.phone || null;
  const attrs = job.customer_assets?.attributes ?? {};
  const vehicle = vehicleLabel(attrs);
  const registration = vehicleRegistration(attrs);
  const size = vehicleSize(attrs);
  const fuel = vehicleFuel(attrs);
  const address = [job.service_address, job.service_city].filter(Boolean).join(', ');
  const settled = (job.payments ?? []).some((p) => p.status === 'paid');
  const busy = update.isPending || collect.isPending;

  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try {
      await fn();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not work.');
    }
  }

  const ACTION_LABELS: Record<string, string> = {
    assign: 'Assign a technician',
    start: 'Start job',
    complete: 'Mark complete',
    collect: `Collect ${PRICE.format(job.net_price)}`,
  };

  function onPrimary() {
    if (!job) return;
    if (action === 'assign') {
      setAssigning(true);
      return;
    }
    if (action === 'start') {
      void run(() => update.mutateAsync({ bookingId: job.id, status: 'in_progress' }));
      return;
    }
    if (action === 'complete') {
      void run(() => update.mutateAsync({ bookingId: job.id, status: 'completed' }));
      return;
    }
    if (action === 'collect') {
      void run(() => collect.mutateAsync(job.id));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <View style={styles.headTop}>
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
              <StatusChip tone={statusTone(job)} />
            </View>
            <ThemedText type="title">{job.services?.name ?? 'Service'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {WHEN.format(new Date(job.scheduled_at))} · {customer}
            </ThemedText>
          </View>

          {/* Money first. It is the one thing on this screen you might open it
              just to check, and it decides whether the job is really finished. */}
          <Card style={styles.card}>
            {job.discount_amount + job.promo_discount_amount > 0 && (
              <>
                <Row label="Service" value={PRICE.format(job.total_price)} />
                {job.promo_discount_amount > 0 && (
                  <Row label="Promo code" value={`− ${PRICE.format(job.promo_discount_amount)}`} />
                )}
                {job.discount_amount > 0 && (
                  <Row label="Discount" value={`− ${PRICE.format(job.discount_amount)}`} />
                )}
              </>
            )}
            <View style={styles.totalRow}>
              <ThemedText type="label" themeColor="textMuted">
                TOTAL
              </ThemedText>
              <ThemedText type="display">{PRICE.format(job.net_price)}</ThemedText>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.payRow}>
              <View
                style={[
                  styles.payDot,
                  {
                    backgroundColor:
                      job.payment_method === 'cod' && !settled ? theme.error : theme.success,
                  },
                ]}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {job.payment_method === 'cod'
                  ? settled
                    ? 'Cash · collected'
                    : 'Cash on delivery · not collected'
                  : settled
                    ? 'Paid online · Razorpay'
                    : 'Online · not settled'}
              </ThemedText>
            </View>
          </Card>

          <Timeline status={job.status} />

          <Card style={styles.card}>
            <View style={styles.person}>
              <View style={[styles.avatar, { backgroundColor: theme.surfaceSunk }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {initialsOf(customer)}
                </ThemedText>
              </View>
              <View style={styles.personCopy}>
                <ThemedText type="bodyMedium" numberOfLines={1}>
                  {customer}
                </ThemedText>
                {phone ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {phone}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            {phone ? (
              <>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.contactRow}>
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${customer}`}
                    style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}
                  >
                    <ThemedText type="smallBold" themeColor="primary">
                      Call
                    </ThemedText>
                  </Pressable>
                  <View style={[styles.contactDivider, { backgroundColor: theme.border }]} />
                  <Pressable
                    // wa.me wants a bare country-coded number, so everything
                    // that is not a digit comes off — including the leading +.
                    onPress={() =>
                      Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`WhatsApp ${customer}`}
                    style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}
                  >
                    <ThemedText type="smallBold" themeColor="primary">
                      WhatsApp
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Card>

          <Card style={styles.card}>
            <View style={styles.grid}>
              <Cell label="Vehicle" value={vehicle ?? '—'} />
              {/* The plate, because it is what the shop calls the car once it is
                  on the ramp and two Swifts look the same from the door. */}
              <Cell label="Registration" value={registration ?? '—'} />
              <Cell label="Size" value={size ?? '—'} />
              <Cell label="Fuel" value={fuel ?? '—'} />
              <Cell label="Slot" value={SLOT.format(new Date(job.scheduled_at))} />
              <Cell
                label="Duration"
                value={
                  job.services?.duration_minutes
                    ? `${Math.round(job.services.duration_minutes / 60)} hrs`
                    : '—'
                }
              />
            </View>
            {address ? (
              <>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Row label={job.needs_pickup ? 'Collect from' : 'At'} value={address} />
              </>
            ) : null}
            {job.needs_pickup ? <Row label="Pickup" value="Requested" accent /> : null}
          </Card>

          <Card style={styles.card}>
            <View style={styles.person}>
              <View style={[styles.avatar, { backgroundColor: theme.surfaceSunk }]}>
                <ThemedText type="smallBold" themeColor="textMuted">
                  {job.technicians?.name ? initialsOf(job.technicians.name) : '—'}
                </ThemedText>
              </View>
              <View style={styles.personCopy}>
                <ThemedText type="label" themeColor="textMuted">
                  TECHNICIAN
                </ThemedText>
                <ThemedText type="bodyMedium">
                  {job.technicians?.name ?? 'Nobody yet'}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setAssigning(true)}
                accessibilityRole="button"
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <ThemedText type="smallBold" themeColor="primary">
                  {job.technician_id ? 'Change' : 'Assign'}
                </ThemedText>
              </Pressable>
            </View>
          </Card>

          {/* Only what is actually recorded. Assigning, starting and finishing
              leave no timestamp behind, so they are absent rather than dated
              with a guess. */}
          <Card style={styles.card}>
            <ThemedText type="label" themeColor="textMuted">
              ACTIVITY
            </ThemedText>
            {jobActivity(job).map((event, i, all) => (
              <View key={event.key} style={styles.event}>
                <View style={styles.eventRail}>
                  <View
                    style={[
                      styles.eventDot,
                      {
                        backgroundColor:
                          event.tone === 'good'
                            ? theme.success
                            : event.tone === 'bad'
                              ? theme.error
                              : theme.textMuted,
                      },
                    ]}
                  />
                  {i < all.length - 1 && (
                    <View style={[styles.eventLine, { backgroundColor: theme.border }]} />
                  )}
                </View>
                <View style={styles.eventCopy}>
                  <ThemedText type="small">{event.label}</ThemedText>
                  <ThemedText type="caption" themeColor="textMuted">
                    {stampOf(event.at)}
                  </ThemedText>
                </View>
              </View>
            ))}
          </Card>

          {problem && (
            <View style={styles.body}>
              <ThemedText type="small" themeColor="error">
                {problem}
              </ThemedText>
            </View>
          )}
        </ScrollView>

        {action && (
          <View
            style={[
              styles.footer,
              { backgroundColor: theme.surface, borderTopColor: theme.border },
            ]}
          >
            <Button
              label={busy ? 'Working…' : ACTION_LABELS[action]}
              loading={busy}
              onPress={onPrimary}
            />
          </View>
        )}

        <AssignSheet
          visible={assigning}
          technicians={technicians ?? []}
          currentTechnicianId={job.technician_id}
          jobLine={`${job.services?.name ?? 'Service'} · ${customer}`}
          busy={update.isPending}
          onClose={() => setAssigning(false)}
          onAssign={(technicianId) =>
            void run(async () => {
              // Assigning also moves the job out of "confirmed" — the two are
              // one decision, and leaving the status behind would put the job
              // back in the unassigned queue it just left.
              await update.mutateAsync({ bookingId: job.id, technicianId, status: 'assigned' });
              setAssigning(false);
            })
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function Timeline({ status }: { status: string }) {
  const theme = useTheme();
  const at = BOOKING_TIMELINE_STATUSES.indexOf(status as (typeof BOOKING_TIMELINE_STATUSES)[number]);

  // A cancelled job has no place on this line; showing it part-way along would
  // imply work still to come.
  if (at === -1) return null;

  return (
    <View style={styles.timeline}>
      {BOOKING_TIMELINE_STATUSES.map((s, i) => {
        const done = i <= at;
        return (
          <View key={s} style={styles.step}>
            <View
              style={[
                styles.dot,
                { backgroundColor: done ? theme.primary : theme.border },
              ]}
            />
            <ThemedText
              type="caption"
              themeColor={done ? 'text' : 'textMuted'}
              numberOfLines={1}
              style={styles.stepLabel}
            >
              {STATUS_LABELS[s] ?? s}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function Row({
  label,
  value,
  accent,
  strong,
}: {
  label: string;
  value: string;
  accent?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText
        type={strong ? 'smallBold' : 'small'}
        themeColor={accent ? 'primary' : 'text'}
        numberOfLines={2}
        style={styles.rowValue}
      >
        {value}
      </ThemedText>
    </View>
  );
}

/** One labelled figure in the vehicle/slot grid. */
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <ThemedText type="label" themeColor="textMuted">
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText type="bodyMedium" numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  scroll: { paddingBottom: Spacing.six, gap: Spacing.three },
  head: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: Spacing.one },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  back: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.one },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  payDot: { width: 8, height: 8, borderRadius: Radius.full },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personCopy: { flex: 1, gap: 2 },
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  contact: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two },
  contactDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three },
  cell: { width: '50%', gap: 2 },
  event: { flexDirection: 'row', gap: Spacing.three },
  // The rail holds the dot and the line joining it to the next one, so the
  // thread stays continuous however tall a row's text runs.
  eventRail: { alignItems: 'center', width: 8 },
  eventDot: { width: 8, height: 8, borderRadius: Radius.full, marginTop: 5 },
  eventLine: { width: StyleSheet.hairlineWidth, flex: 1, marginTop: 2 },
  eventCopy: { flex: 1, gap: 1, paddingBottom: Spacing.two },
  body: { paddingHorizontal: Spacing.four },
  timeline: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
  },
  step: { flex: 1, gap: Spacing.one },
  dot: { height: 4, borderRadius: Radius.full },
  stepLabel: { fontSize: 10 },
  card: { marginHorizontal: Spacing.four, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  rowValue: { flex: 1, textAlign: 'right' },
  link: { paddingTop: Spacing.one },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
