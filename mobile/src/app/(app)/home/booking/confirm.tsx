import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingSteps } from '@/components/booking-steps';
import { PromoCodeField } from '@/components/booking/promo-code-field';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingScreen } from '@/components/ui/feedback';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useCreateBooking, useCustomerAsset } from '@/hooks/use-booking';
import { useBusinessHours, useShopClosures } from '@/hooks/use-hours';
import { useAppSettings, useShops } from '@/hooks/use-app-settings';
import { useServiceDetail } from '@/hooks/use-catalog';
import type { PromoValidation } from '@/hooks/use-promo';
import { useTheme } from '@/hooks/use-theme';
import { calculatePrice } from '@/lib/pricing';
import { getBookableDays, getTimeSlotsForDay, isSlotFull } from '@/lib/scheduling';
import { useShopBusy } from '@/hooks/use-availability';

const PRICE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

export default function BookingConfirmScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const {
    serviceId,
    addonIds,
    assetId,
    contactName,
    contactPhone,
    address,
    city,
    postalCode,
    needsPickup,
    pickupNotes,
  } = useLocalSearchParams<{
    serviceId: string;
    addonIds: string;
    assetId?: string;
    contactName?: string;
    contactPhone?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    needsPickup?: string;
    pickupNotes?: string;
  }>();

  const selectedAddonIds = useMemo(
    () => (addonIds ? addonIds.split(',').filter(Boolean) : []),
    [addonIds],
  );

  const { data: service, isLoading: isServiceLoading } = useServiceDetail(serviceId);
  const { data: asset, isLoading: isAssetLoading } = useCustomerAsset(assetId);
  const createBooking = useCreateBooking();

  // The shop's real hours, so the picker cannot offer a slot create_booking
  // will refuse. Both read the same rows.
  const { shopId } = useAppSettings();
  const { data: hours } = useBusinessHours(shopId);
  // What the shop already has in hand, so a full slot can be greyed out rather
  // than refused after the customer has chosen a vehicle and an address.
  const { data: busy } = useShopBusy(shopId);
  const { data: shops } = useShops();
  const capacity = shops?.find((s) => s.id === shopId)?.concurrent_jobs ?? 1;
  const { data: closures } = useShopClosures(shopId);

  const days = useMemo(() => getBookableDays(new Date(), hours, closures), [hours, closures]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(
    () => getTimeSlotsForDay(days[selectedDayIndex].date, new Date(), hours, closures),
    [days, selectedDayIndex, hours, closures],
  );

  const selectedAttributes = asset?.attributes ?? {};
  const total = service ? calculatePrice(service, selectedAttributes, selectedAddonIds) : 0;

  const [promo, setPromo] = useState<PromoValidation | null>(null);
  // The database returned this figure for this exact job; it is not recomputed
  // here. create_booking will check the code again and price it again, so what
  // is shown and what is charged come from the same place.
  const discount = promo?.valid ? (promo.discount_amount ?? 0) : 0;
  const payable = Math.max(total - discount, 0);
  const selectedAddons = service?.addons.filter((addon) => selectedAddonIds.includes(addon.id)) ?? [];

  const isLoading = isServiceLoading || (Boolean(assetId) && isAssetLoading);

  async function handleConfirm() {
    if (!service || !user || !selectedSlot) {
      setError('Pick a time slot to continue.');
      return;
    }
    setError(null);

    try {
      const booking = await createBooking.mutateAsync({
        serviceId: service.id,
        assetId: assetId ?? null,
        addonIds: selectedAddonIds,
        scheduledAt: selectedSlot,
        contactName,
        contactPhone,
        serviceAddress: address,
        serviceCity: city,
        servicePostalCode: postalCode,
        needsPickup: needsPickup === '1',
        pickupNotes,
        promoCode: promo?.valid ? promo.code : null,
      });

      router.replace({
        pathname: '/(app)/home/booking/payment',
        // The price the database settled on, not the one shown a moment ago.
        // They agree today, but if a price changed between loading this screen
        // and confirming, the server's figure is the one being charged.
        params: {
          bookingId: booking.id,
          amount: String(booking.net_price),
          serviceName: service.name,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the booking.');
    }
  }

  if (isLoading || !service) {
    return <LoadingScreen />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <BookingSteps current="Time" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.head}>
            <ThemedText type="title">Pick a time</ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Choose when you&apos;d like us to come.
            </ThemedText>
          </View>

          <ThemedText type="label" themeColor="textMuted">Date</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
            {days.map((day, index) => {
              const isSelected = index === selectedDayIndex;
              return (
                <Pressable
                  key={day.date.toISOString()}
                  // Shown but not selectable when the shop is shut. A day that
                  // silently is not there reads as a bug; "Sunday — closed"
                  // tells the customer something.
                  disabled={!day.open}
                  accessibilityState={{ disabled: !day.open, selected: isSelected }}
                  accessibilityLabel={day.open ? day.label : `${day.label}, closed`}
                  onPress={() => {
                    setSelectedDayIndex(index);
                    setSelectedSlot(null);
                  }}
                  style={[
                    styles.chip,
                    { borderColor: theme.border },
                    isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                    !day.open && { opacity: 0.45 },
                  ]}
                >
                  <ThemedText
                    type="small"
                    themeColor={isSelected ? 'primaryText' : day.open ? 'text' : 'textMuted'}
                  >
                    {day.label}
                    {day.open ? '' : ' · closed'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <ThemedText type="label" themeColor="textMuted" style={styles.sectionSpacing}>
            Time
          </ThemedText>
          {slots.length === 0 ? (
            <ThemedText themeColor="textSecondary">No slots left for this day.</ThemedText>
          ) : (
            <View style={styles.slotGrid}>
              {slots.map((slot) => {
                const isSelected = selectedSlot?.getTime() === slot.getTime();
                // The server refuses these anyway; showing them as unavailable
                // is what stops someone finding out at the end of the form.
                const full = isSlotFull(slot, service?.duration_minutes ?? null, busy, capacity);
                return (
                  <Pressable
                    key={slot.toISOString()}
                    onPress={() => setSelectedSlot(slot)}
                    disabled={full}
                    accessibilityState={{ disabled: full, selected: isSelected }}
                    accessibilityLabel={full ? `${TIME_FORMATTER.format(slot)} — fully booked` : undefined}
                    style={[
                      styles.chip,
                      { borderColor: theme.border },
                      full && { opacity: 0.4, backgroundColor: theme.surfaceSunk },
                      isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      themeColor={isSelected ? 'primaryText' : full ? 'textMuted' : 'text'}
                    >
                      {TIME_FORMATTER.format(slot)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.promo}>
            <PromoCodeField
              serviceId={service.id}
              assetId={assetId ?? null}
              addonIds={selectedAddonIds}
              applied={promo}
              onApplied={(result) => {
                setPromo(result);
                if (error) setError(null);
              }}
            />
          </View>

          <Card style={styles.summary}>
            <ThemedText type="smallBold">{service.name}</ThemedText>

            {/* Echo back what was entered on the previous step — this is the
                last screen before money changes hands, so the address and
                pickup choice need to be checkable without going back. */}
            {address ? (
              <View style={styles.summaryRow}>
                <ThemedText themeColor="textSecondary" type="small">
                  {needsPickup === '1' ? 'Collect from' : 'At'}
                </ThemedText>
                <ThemedText
                  themeColor="textSecondary"
                  type="small"
                  numberOfLines={2}
                  style={styles.summaryValue}
                >
                  {[address, city, postalCode].filter(Boolean).join(', ')}
                </ThemedText>
              </View>
            ) : null}

            {contactName ? (
              <View style={styles.summaryRow}>
                <ThemedText themeColor="textSecondary" type="small">
                  Contact
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {contactName}
                  {contactPhone ? ` · ${contactPhone}` : ''}
                </ThemedText>
              </View>
            ) : null}
            {selectedAddons.map((addon) => (
              <View key={addon.id} style={styles.summaryRow}>
                <ThemedText themeColor="textSecondary" type="small">
                  {addon.name}
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {PRICE_FORMATTER.format(addon.price)}
                </ThemedText>
              </View>
            ))}
            {/* Only broken out when there is something to break out. Without a
                code the summary stays a single Total, as before. */}
            {discount > 0 && (
              <>
                <View style={styles.summaryRow}>
                  <ThemedText themeColor="textSecondary" type="small">
                    Subtotal
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    {PRICE_FORMATTER.format(total)}
                  </ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText themeColor="primary" type="small">
                    {promo?.code}
                  </ThemedText>
                  <ThemedText themeColor="primary" type="small">
                    − {PRICE_FORMATTER.format(discount)}
                  </ThemedText>
                </View>
              </>
            )}
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <ThemedText type="smallBold">Total</ThemedText>
              <ThemedText type="price">{PRICE_FORMATTER.format(payable)}</ThemedText>
            </View>
          </Card>

          {error && <ThemedText type="small" themeColor="error">{error}</ThemedText>}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            label={createBooking.isPending ? 'Booking…' : 'Confirm booking'}
            loading={createBooking.isPending}
            onPress={handleConfirm}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  head: { gap: Spacing.one, marginBottom: Spacing.two },
  dayRow: {
    flexDirection: 'row',
  },
  sectionSpacing: {
    marginTop: Spacing.three,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginRight: Spacing.two,
  },
  promo: { marginTop: Spacing.four },
  summary: { marginTop: Spacing.four, gap: Spacing.two },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryValue: { flex: 1, textAlign: 'right' },
  summaryTotal: {
    marginTop: Spacing.one,
    paddingTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  confirmButton: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
  },
});
