'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { saveCapacity } from '@/app/(dashboard)/hours/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * How many jobs this shop can have in hand at once.
 *
 * The one number on this page that refuses bookings. Opening hours are
 * information and a blocked day stops a single date; this stops a fifth car
 * turning up to a shop with four bays, every day, without anyone having to
 * watch the calendar.
 *
 * Worth being explicit in the copy that it counts *overlapping* jobs rather
 * than jobs per day, because the services here run to days: a sixty-hour paint
 * protection job holds its bay until Thursday, and an owner who reads this as
 * "bookings per day" will set it far too high.
 */
export function CapacityCard({ concurrentJobs }: { concurrentJobs: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(concurrentJobs));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveCapacity(Number(value));
          setMessage({
            ok: result.ok,
            text: result.ok ? 'Saved.' : (result.message ?? 'That did not work.'),
          });
          if (result.ok) router.refresh();
        });
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">How much you can take on</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Unlike opening hours, this one does turn customers away: a booking that would put you
          over it is refused.
        </p>
      </div>

      <div>
        <Label htmlFor="concurrent_jobs" className="mb-1.5">
          Jobs at the same time
        </Label>
        <Input
          id="concurrent_jobs"
          name="concurrent_jobs"
          type="number"
          min={1}
          max={50}
          className="w-40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Bays, ramps, or however you count what you can work on at once — not bookings per day. A
          job that takes three days occupies its place for all three, so a shop with one bay takes
          one such job at a time.
        </p>
      </div>

      {message ? (
        <p className={message.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
