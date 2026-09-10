'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import type { BookingListItem } from '@/types/database';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Granting a discount on a single job.
 *
 * Written with the caller's own session, not a service key: the RLS policies
 * and the enforce_customer_booking_transitions guard both key off being staff
 * of this booking's shop, so this fails safely for anyone who reaches the page
 * without that standing.
 *
 * The database is the real gate — it refuses a discount above the price, a
 * negative one, and any change once money has been received. This form only
 * tries to make those refusals unnecessary.
 */
export function DiscountControl({ booking }: { booking: BookingListItem }) {
  const router = useRouter();
  const [amount, setAmount] = useState(
    booking.discount_amount > 0 ? String(booking.discount_amount) : '',
  );
  const [reason, setReason] = useState(booking.discount_reason ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPaid = (booking.payments ?? []).some((p) => p.status === 'paid');
  const parsed = Number(amount || 0);
  const invalid =
    amount !== '' && (Number.isNaN(parsed) || parsed < 0 || parsed > booking.total_price);
  const unchanged =
    parsed === booking.discount_amount && reason.trim() === (booking.discount_reason ?? '');

  async function save() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from('bookings')
      .update({
        discount_amount: parsed,
        // A discount with no stated reason is unauditable six months later.
        discount_reason: parsed > 0 ? reason.trim() || 'Discount' : null,
      })
      .eq('id', booking.id)
      .select('id');

    setBusy(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    // PostgREST answers 204 for a write that matched nothing, which reads as
    // success; the returned rows are what prove it landed.
    if (!data || data.length === 0) {
      setError('That booking could not be updated.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Discount
        </span>
        <span className="text-sm tabular-nums">
          {/* Either kind of discount makes the gross worth showing struck
              through — the promo is the customer's, and this panel only edits
              the shop's, but the number people reconcile against is the net. */}
          {booking.discount_amount > 0 || booking.promo_discount_amount > 0 ? (
            <>
              <span className="text-muted-foreground line-through">
                {PRICE.format(booking.total_price)}
              </span>{' '}
              <span className="font-semibold">{PRICE.format(booking.net_price)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{PRICE.format(booking.total_price)}</span>
          )}
        </span>
      </div>

      {/* Read-only: the customer applied this at booking, and it was validated
          and frozen then. Changing it here would rewrite what they agreed to. */}
      {booking.promo_discount_amount > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Customer used{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">
            {booking.promo_codes?.code ?? 'a promo code'}
          </code>{' '}
          for −{PRICE.format(booking.promo_discount_amount)}
        </p>
      )}

      {isPaid ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This booking is already paid, so the discount is fixed. Reducing a settled amount is a
          refund, not a discount.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="sm:w-32">
              <Label htmlFor={'discount-' + booking.id} className="mb-1 text-xs">
                Amount
              </Label>
              <Input
                id={'discount-' + booking.id}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                  setError(null);
                }}
                inputMode="decimal"
                placeholder="0"
                className="h-8"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor={'reason-' + booking.id} className="mb-1 text-xs">
                Reason
              </Label>
              <Input
                id={'reason-' + booking.id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="Regular customer"
                className="h-8"
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || invalid || unchanged}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : booking.discount_amount > 0 ? 'Update discount' : 'Apply discount'}
            </Button>
            {invalid && (
              <span className="text-xs text-destructive">
                Between 0 and {PRICE.format(booking.total_price)}.
              </span>
            )}
            {!invalid && parsed > 0 && !unchanged && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {/* Both discounts come off, floored at zero — the same sum the
                    generated net_price column performs. */}
                Customer pays{' '}
                {PRICE.format(
                  Math.max(booking.total_price - parsed - booking.promo_discount_amount, 0),
                )}
              </span>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
}
