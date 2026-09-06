import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TimePickerSheet } from '@/components/owner/time-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Radius, Spacing } from '@/constants/theme';
import {
  useAddClosure,
  useBusinessHours,
  useRemoveClosure,
  useShopClosures,
  useUpdateHours,
} from '@/hooks/use-hours';
import { useMyShopId } from '@/hooks/use-my-shop';
import { useTheme } from '@/hooks/use-theme';
import { formatClock, type BusinessHours } from '@/lib/scheduling';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Chosen from a list, not typed: a shop opens on the half hour, and a time
 *  keyboard on a phone is a worse way to say "nine o'clock". */
function halfHours(fromHour: number, toHour: number): string[] {
  const out: string[] = [];
  for (let m = fromHour * 60; m <= toHour * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

const OPEN_TIMES = halfHours(6, 12);
const CLOSE_TIMES = halfHours(12, 22);

export default function OwnerHoursScreen() {
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ weekday: number; edge: 'opens' | 'closes' } | null>(
    null,
  );
  const shopId = useMyShopId();
  const hours = useBusinessHours(shopId);
  const closures = useShopClosures(shopId);
  const updateHours = useUpdateHours(shopId);
  const addClosure = useAddClosure(shopId);
  const removeClosure = useRemoveClosure();

  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try {
      await fn();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not work.');
    }
  }

  // The next fourteen days, minus any already blocked — enough to cover a
  // festival or a trip without a date picker.
  const upcoming = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) };
  }).filter((d) => !(closures.data ?? []).some((c) => c.closed_on === d.iso));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={hours.isRefetching}
              onRefresh={() => {
                void hours.refetch();
                void closures.refetch();
              }}
            />
          }
        >
          <View style={styles.header}>
            <ThemedText type="title">Hours</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Customers can only book inside these hours, minus blocked days.
            </ThemedText>
          </View>

          {problem && (
            <View style={styles.body}>
              <ThemedText type="small" themeColor="error">
                {problem}
              </ThemedText>
            </View>
          )}

          {hours.isLoading ? (
            <View style={styles.body}>
              <SkeletonList count={4} height={56} />
            </View>
          ) : hours.isError ? (
            <View style={styles.body}>
              <ErrorState message={(hours.error as Error).message} onRetry={() => hours.refetch()} />
            </View>
          ) : (
            <View style={styles.stack}>
              {(hours.data ?? []).map((h) => (
                <DayRow
                  key={h.weekday}
                  hours={h}
                  busy={updateHours.isPending}
                  onToggle={(open) =>
                    void run(() => updateHours.mutateAsync({ weekday: h.weekday, is_open: open }))
                  }
                  onEditOpen={() => setPicking({ weekday: h.weekday, edge: 'opens' })}
                  onEditClose={() => setPicking({ weekday: h.weekday, edge: 'closes' })}
                />
              ))}
            </View>
          )}

          <View style={styles.sectionHead}>
            <ThemedText type="label" themeColor="textMuted">
              Blocked days
            </ThemedText>
          </View>

          <View style={styles.stack}>
            {(closures.data ?? []).length === 0 ? (
              <Card style={styles.empty}>
                <ThemedText type="small" themeColor="textSecondary">
                  No days blocked. Add one below for a holiday or a day off.
                </ThemedText>
              </Card>
            ) : (
              (closures.data ?? []).map((c) => (
                <Card key={c.id} style={styles.row}>
                  <View style={styles.rowCopy}>
                    <ThemedText type="bodyMedium">
                      {new Date(c.closed_on).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </ThemedText>
                    {c.reason ? (
                      <ThemedText type="caption" themeColor="textMuted">
                        {c.reason}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void run(() => removeClosure.mutateAsync(c.id))}
                    accessibilityRole="button"
                    accessibilityLabel="Unblock this day"
                    hitSlop={8}
                  >
                    <ThemedText type="smallBold" themeColor="primary">
                      Unblock
                    </ThemedText>
                  </Pressable>
                </Card>
              ))
            )}
          </View>

          <View style={styles.sectionHead}>
            <ThemedText type="label" themeColor="textMuted">
              Block a day
            </ThemedText>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {upcoming.map((d) => (
              <Pressable
                key={d.iso}
                onPress={() =>
                  void run(() => addClosure.mutateAsync({ closedOn: d.iso, reason: 'Blocked from the app' }))
                }
                accessibilityRole="button"
                accessibilityLabel={`Block ${d.label}`}
                disabled={addClosure.isPending}
                style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.7 : 1 }]}
              >
                <ThemedText type="small">{d.label}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.body}>
            <ThemedText type="caption" themeColor="textMuted">
              Tap a time to change it — it saves straight away. These hours are checked again when a
              booking is made, so a slot
              outside them is refused even if an old app version offers it.
            </ThemedText>
          </View>
        </ScrollView>

        {picking && (
          <TimePickerSheet
            visible
            title={`${DAY_NAMES[picking.weekday]} ${picking.edge === 'opens' ? 'opening' : 'closing'} time`}
            times={picking.edge === 'opens' ? OPEN_TIMES : CLOSE_TIMES}
            selected={
              (hours.data ?? []).find((h) => h.weekday === picking.weekday)?.[
                picking.edge === 'opens' ? 'opens_at' : 'closes_at'
              ] ?? ''
            }
            onClose={() => setPicking(null)}
            onPick={(time) => {
              const patch =
                picking.edge === 'opens' ? { opens_at: time } : { closes_at: time };
              setPicking(null);
              void run(() => updateHours.mutateAsync({ weekday: picking.weekday, ...patch }));
            }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function DayRow({
  hours,
  busy,
  onToggle,
  onEditOpen,
  onEditClose,
}: {
  hours: BusinessHours;
  busy?: boolean;
  onToggle: (open: boolean) => void;
  onEditOpen: () => void;
  onEditClose: () => void;
}) {
  const theme = useTheme();

  // The times are drawn as fields rather than plain text, so it is obvious
  // they can be changed without having to tap one to find out.
  const chip = ({ pressed }: { pressed: boolean }) => [
    styles.timeChip,
    { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
  ];

  return (
    <Card style={styles.row}>
      <ThemedText
        type="bodyMedium"
        themeColor={hours.is_open ? 'text' : 'textMuted'}
        style={styles.dayName}
      >
        {DAY_NAMES[hours.weekday]}
      </ThemedText>

      {hours.is_open ? (
        <View style={styles.times}>
          <Pressable
            onPress={onEditOpen}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Opens at ${formatClock(hours.opens_at)}. Change.`}
            style={chip}
          >
            <ThemedText type="small" themeColor="primary">
              {formatClock(hours.opens_at)}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textMuted">
            –
          </ThemedText>
          <Pressable
            onPress={onEditClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Closes at ${formatClock(hours.closes_at)}. Change.`}
            style={chip}
          >
            <ThemedText type="small" themeColor="primary">
              {formatClock(hours.closes_at)}
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textMuted" style={styles.times}>
          Closed
        </ThemedText>
      )}

      <Switch
        value={hours.is_open}
        onValueChange={onToggle}
        disabled={busy}
        accessibilityLabel={`${DAY_NAMES[hours.weekday]} open`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { paddingBottom: Spacing.six },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: 2 },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  sectionHead: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.two },
  stack: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dayName: { width: 92 },
  rowCopy: { flex: 1, gap: 1 },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  timeChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DFE5EB',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  empty: { gap: 2 },
});
