import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssignSheet } from '@/components/owner/assign-sheet';
import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Radius, Spacing } from '@/constants/theme';
import { useMyShop } from '@/hooks/use-my-shop';
import {
  useOwnerBookings,
  useTechnicians,
  useUpdateBooking,
  type OwnerBooking,
} from '@/hooks/use-owner';
import { useTheme } from '@/hooks/use-theme';
import {
  bookedToday,
  cashToCollect,
  inTheBay,
  jobsLeft,
  needsAssignment,
  statusTone,
  suggestTechnician,
  isOverdue,
  openBookings,
  todaysBookings,
  whenLabel,
  TONE_LABELS,
  type TechnicianSuggestion,
} from '@/lib/owner-board';
import { firstNameOf, initialsOf } from '@/lib/team';
import { vehicleLabel } from '@/lib/vehicle';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

function customerName(b: OwnerBooking): string {
  return b.contact_name || b.profiles?.name || 'Unnamed customer';
}

function vehicleOf(b: OwnerBooking): string | null {
  return vehicleLabel(b.customer_assets?.attributes);
}

export default function OwnerInboxScreen() {
  const theme = useTheme();
  // The shop being managed, not the one this person books with as a customer.
  const { shop: managed } = useMyShop();
  const { data, isLoading, isError, error, refetch, isRefetching } = useOwnerBookings();
  const { data: technicians } = useTechnicians();
  const update = useUpdateBooking();

  const [assigning, setAssigning] = useState<OwnerBooking | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const board = useMemo(() => {
    // Two different questions, and they had the same answer before, which is
    // why unfinished work disappeared at midnight. The queues are about what
    // the shop still owes, whenever it was booked; the figures are about
    // today, because "booked today" means today.
    const open = openBookings(data);
    const today = todaysBookings(data);
    return {
      open,
      needs: needsAssignment(open),
      bay: inTheBay(open),
      booked: bookedToday(today),
      left: jobsLeft(today),
      cash: cashToCollect(today),
    };
  }, [data]);

  async function assign(booking: OwnerBooking, technicianId: string) {
    setProblem(null);
    try {
      // Assigning also moves the job out of "confirmed" — the two are one
      // decision, and leaving the status behind would put the job straight back
      // into the queue it just left.
      await update.mutateAsync({ bookingId: booking.id, technicianId, status: 'assigned' });
      setAssigning(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not assign that job.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            // A shop board that cannot be pulled fresh is a board nobody
            // trusts — the day changes while you are looking at it.
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="label" themeColor="textMuted" numberOfLines={1}>
                {[managed?.name, managed?.city].filter(Boolean).join(' · ')}
              </ThemedText>
              {/* "Today" rather than a greeting: this screen is a day's board,
                  and the heading should say which day it is showing. */}
              <ThemedText type="display">Today</ThemedText>
            </View>
            <Pressable
              onPress={() => router.push('/(owner)/shop')}
              accessibilityRole="button"
              accessibilityLabel="Shop settings"
              hitSlop={8}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <ShopAvatar url={managed?.logo_url ?? null} name={managed?.name} size={40} />
            </Pressable>
          </View>

          {problem && (
            <View style={styles.body}>
              <ThemedText type="small" themeColor="error">
                {problem}
              </ThemedText>
            </View>
          )}

          {isLoading ? (
            <View style={styles.body}>
              <SkeletonList count={3} height={84} />
            </View>
          ) : isError ? (
            <View style={styles.body}>
              <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
            </View>
          ) : (
            <>
              {/* One card, three figures. Separate cards made them read as three
                  unrelated things; they are three readings of the same day. */}
              <View style={styles.body}>
                <Card style={styles.stats}>
                  <Stat label="Booked today" value={PRICE.format(board.booked)} />
                  <Divider />
                  <Stat label="Jobs left" value={String(board.left)} />
                  <Divider />
                  <Stat
                    label="Unassigned"
                    value={String(board.needs.length)}
                    tone={board.needs.length > 0 ? theme.error : undefined}
                  />
                </Card>
              </View>

              {/* Only when there is money outstanding. A zero here would be
                  noise; a number is something to act on before closing. */}
              {board.cash > 0 && (
                <View style={styles.body}>
                  <Card style={[styles.cash, { borderColor: theme.error }]}>
                    <ThemedText type="smallBold" themeColor="error">
                      {PRICE.format(board.cash)} cash still to collect
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      Finished jobs where the money has not been marked in.
                    </ThemedText>
                  </Card>
                </View>
              )}

              <Section title="Needs you" count={board.needs.length}>
                {board.needs.length === 0 ? (
                  <Card style={styles.empty}>
                    <ThemedText type="bodyMedium">Inbox clear</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Every job today has someone on it.
                    </ThemedText>
                  </Card>
                ) : (
                  // One card holding the queue, hairlines between jobs — rather
                  // than a card each. A stack of cards reads as unrelated
                  // errands; this reads as one list with a length.
                  <Card style={styles.list}>
                    {board.needs.map((b, i) => (
                      <View key={b.id}>
                        {i > 0 && (
                          <View style={[styles.listDivider, { backgroundColor: theme.border }]} />
                        )}
                        <NeedsRow
                          booking={b}
                          suggestion={suggestTechnician(b, technicians, board.open)}
                          onAssign={() => setAssigning(b)}
                        />
                      </View>
                    ))}
                  </Card>
                )}
              </Section>

              {/* No count here. "Needs you" is a queue and the number is the
                  point; the bay is just what is happening, and a badge on it
                  read as a second thing demanding attention. */}
              {board.bay.length > 0 && (
                <Section title="In the bay" count={0}>
                  <Card style={styles.list}>
                    {board.bay.map((b, i) => (
                      <View key={b.id}>
                        {i > 0 && (
                          <View style={[styles.listDivider, { backgroundColor: theme.border }]} />
                        )}
                        <BayRow booking={b} />
                      </View>
                    ))}
                  </Card>
                </Section>
              )}

              {board.open.length === 0 && (
                <View style={styles.body}>
                  <Card style={styles.empty}>
                    <ThemedText type="bodyMedium">Nothing outstanding</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      New bookings from the app land here as they come in.
                    </ThemedText>
                  </Card>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {assigning && (
          <AssignSheet
            visible
            technicians={technicians ?? []}
            // Opens on whoever the board suggested, so the common case is open
            // then confirm. Anyone else is still one tap away in the list.
            currentTechnicianId={
              suggestTechnician(assigning, technicians, board.open)?.technicianId ?? null
            }
            jobLine={`${assigning.services?.name ?? 'Service'} · ${customerName(assigning)}`}
            busy={update.isPending}
            onClose={() => setAssigning(null)}
            onAssign={(technicianId) => void assign(assigning, technicianId)}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="label" themeColor="textMuted" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="price" style={tone ? { color: tone } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText type="label" themeColor="textMuted">
          {title}
        </ThemedText>
        {count > 0 && (
          <View style={[styles.countBadge, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="caption" themeColor="primary">
              {count}
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.stack}>{children}</View>
    </View>
  );
}

/**
 * A job with nobody on it.
 *
 * Not a card of its own — it sits inside the queue's card. Two tap targets live
 * in it as siblings, "open the job" and "assign it", because nesting one
 * pressable in another gives an ambiguous tap on native and is invalid HTML on
 * web, where each Pressable renders as a <button>.
 */
function NeedsRow({
  booking,
  suggestion,
  onAssign,
}: {
  booking: OwnerBooking;
  suggestion: TechnicianSuggestion | null;
  onAssign: () => void;
}) {
  const theme = useTheme();
  const vehicle = vehicleOf(booking);

  return (
    <View style={styles.needsBlock}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(owner)/job/[bookingId]',
            params: { bookingId: booking.id },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`Open ${booking.services?.name ?? 'job'}`}
        style={({ pressed }) => [styles.needsMain, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.rowHead}>
          <ThemedText type="bodyMedium" numberOfLines={1} style={styles.rowTitle}>
            {booking.services?.name ?? 'Service'}
          </ThemedText>
          <ThemedText type="smallBold">{PRICE.format(booking.net_price)}</ThemedText>
        </View>
        {/* Red when the job was due on an earlier day. The queue spans days
            now, so "waiting" and "late" need to look different. */}
        <ThemedText
          type="small"
          themeColor={isOverdue(booking.scheduled_at) ? 'error' : 'textSecondary'}
          numberOfLines={1}
        >
          {[customerName(booking), vehicle, whenLabel(booking.scheduled_at)]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </Pressable>

      <View style={styles.assignRow}>
        {suggestion ? (
          <View style={[styles.suggestion, { backgroundColor: theme.primarySoft }]}>
            <View style={[styles.suggestionAvatar, { backgroundColor: theme.primary }]}>
              <ThemedText type="caption" style={{ color: theme.primaryText }}>
                {initialsOf(suggestion.name)}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="primary" numberOfLines={1} style={styles.rowTitle}>
              {firstNameOf(suggestion.name)}
              {suggestion.freeFrom
                ? ` — free from ${TIME.format(suggestion.freeFrom)}`
                : suggestion.freeUntil
                  ? ` — free till ${TIME.format(suggestion.freeUntil)}`
                  : ' — free today'}
            </ThemedText>
          </View>
        ) : (
          <View style={[styles.suggestion, { backgroundColor: theme.surfaceSunk }]}>
            <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
              Nobody free right now
            </ThemedText>
          </View>
        )}

        <Pressable
          onPress={onAssign}
          accessibilityRole="button"
          accessibilityLabel={`Assign ${booking.services?.name ?? 'this job'}`}
          style={({ pressed }) => [
            styles.assignButton,
            { backgroundColor: theme.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
            Assign
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/** A job already with someone, carrying a stripe in its status colour. */
function BayRow({ booking }: { booking: OwnerBooking }) {
  const theme = useTheme();
  const tone = statusTone(booking);

  const paint: Record<string, { fg: string; bg: string }> = {
    working: { fg: theme.warning, bg: theme.warningSoft },
    cashDue: { fg: theme.error, bg: theme.errorSoft },
    assigned: { fg: theme.primary, bg: theme.primarySoft },
    done: { fg: theme.success, bg: theme.successSoft },
    unassigned: { fg: theme.textMuted, bg: theme.surfaceSunk },
    cancelled: { fg: theme.textMuted, bg: theme.surfaceSunk },
  };
  const colour = paint[tone] ?? paint.assigned;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(owner)/job/[bookingId]',
          params: { bookingId: booking.id },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open ${booking.services?.name ?? 'job'}`}
      style={({ pressed }) => [styles.bayBlock, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.stripe, { backgroundColor: colour.fg }]} />
      <View style={styles.bayCopy}>
        <ThemedText type="bodyMedium" numberOfLines={1}>
          {booking.services?.name ?? 'Service'}
        </ThemedText>
        <ThemedText
          type="small"
          themeColor={isOverdue(booking.scheduled_at) ? 'error' : 'textSecondary'}
          numberOfLines={1}
        >
          {[booking.technicians?.name, whenLabel(booking.scheduled_at)]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>
      <View style={[styles.pill, { backgroundColor: colour.bg }]}>
        <ThemedText type="caption" style={{ color: colour.fg }}>
          {TONE_LABELS[tone]}
        </ThemedText>
      </View>
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
  headerCopy: { flex: 1, gap: Spacing.one },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  stats: { flexDirection: 'row', alignItems: 'stretch' },
  stat: { flex: 1, gap: 3, paddingHorizontal: Spacing.two },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  cash: { gap: 2, borderWidth: 1 },
  section: { marginTop: Spacing.four, gap: Spacing.two },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  countBadge: {
    minWidth: 20,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
  },
  stack: { paddingHorizontal: Spacing.four },
  list: { gap: 0 },
  listDivider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.three },
  needsBlock: { gap: Spacing.three },
  needsMain: { gap: Spacing.one },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowTitle: { flex: 1 },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  suggestion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  suggestionAvatar: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignButton: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
  },
  bayBlock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stripe: { width: 3, alignSelf: 'stretch', borderRadius: Radius.full, minHeight: 34 },
  bayCopy: { flex: 1, gap: 2 },
  pill: { borderRadius: Radius.full, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  empty: { gap: 2 },
});
