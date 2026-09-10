'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { addClosure, removeClosure } from '@/app/(dashboard)/hours/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ClosureRow {
  id: string;
  closed_on: string;
  reason: string | null;
}

const DATE = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Days the shop will not work.
 *
 * Distinct from the weekly hours in what it does, not just when it applies: a
 * blocked date is the one thing here that still refuses a booking. Opening
 * hours describe when the shop is staffed and the customer app treats them as
 * information; a closure is the shop saying "not that day", and create_booking
 * enforces it.
 *
 * Worth keeping visible, because that difference is not guessable from a screen
 * that shows both.
 */
export function ClosuresCard({ closures }: { closures: ClosureRow[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? 'That did not work.');
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  // Today in the browser's own calendar, so the picker cannot offer yesterday.
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  return (
    <section className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Blocked days</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Holidays and shutdowns. Unlike opening hours, a blocked day does stop customers booking —
          they are told the shop is closed on that date.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {closures.length === 0 ? (
        <p className="text-sm text-muted-foreground">No days blocked.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {DATE.format(new Date(`${c.closed_on}T00:00:00`))}
                </div>
                {c.reason ? (
                  <div className="truncate text-xs text-muted-foreground">{c.reason}</div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(() => removeClosure(c.id))}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(
            () => addClosure(fd),
            () => formRef.current?.reset(),
          );
        }}
      >
        <div>
          <Label htmlFor="closed_on" className="mb-1.5">
            Block a day
          </Label>
          <Input id="closed_on" name="closed_on" type="date" min={minDate} required />
        </div>
        <div className="min-w-48 flex-1">
          <Label htmlFor="reason" className="mb-1.5">
            Reason <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="reason" name="reason" maxLength={120} placeholder="Diwali" />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? 'Blocking…' : 'Block'}
        </Button>
      </form>
    </section>
  );
}
