'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { saveHours, type DayInput } from '@/app/(dashboard)/hours/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/** 0 = Sunday, matching Postgres's extract(dow) and JavaScript's getDay(). */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "09:00:00" as "09:00" — the column is a time, the input wants HH:MM. */
function toInputTime(value: string): string {
  return value.slice(0, 5);
}

/**
 * The week, as the shop keeps it.
 *
 * One form and one save rather than a write per keystroke: hours are usually
 * edited as a set — the whole week shifts, or Saturday changes with Sunday —
 * and a page that saved on every change would make a half-finished edit live
 * while someone was still typing the other half.
 *
 * These hours no longer decide what can be booked; they say when the shop is
 * staffed, and the customer app shows them as that. The copy below says so,
 * because an owner who thinks this is a booking gate will set it defensively.
 */
export function HoursForm({ days }: { days: DayInput[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(() =>
    days.map((d) => ({ ...d, opens_at: toInputTime(d.opens_at), closes_at: toInputTime(d.closes_at) })),
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function update(weekday: number, patch: Partial<DayInput>) {
    setMessage(null);
    setRows((current) => current.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  }

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveHours(rows);
          setMessage({
            ok: result.ok,
            text: result.ok ? 'Saved.' : (result.message ?? 'That did not work.'),
          });
          if (result.ok) router.refresh();
        });
      }}
    >
      <div className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.weekday} className="flex flex-wrap items-center gap-3 p-3">
            <div className="w-24 shrink-0 text-sm font-medium">{DAY_NAMES[row.weekday]}</div>

            <Switch
              checked={row.is_open}
              disabled={pending}
              aria-label={`${DAY_NAMES[row.weekday]} open`}
              onCheckedChange={(next) => update(row.weekday, { is_open: next })}
            />

            {row.is_open ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-32"
                  value={row.opens_at}
                  disabled={pending}
                  aria-label={`${DAY_NAMES[row.weekday]} opens at`}
                  onChange={(e) => update(row.weekday, { opens_at: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  className="w-32"
                  value={row.closes_at}
                  disabled={pending}
                  aria-label={`${DAY_NAMES[row.weekday]} closes at`}
                  onChange={(e) => update(row.weekday, { closes_at: e.target.value })}
                />
              </div>
            ) : (
              // The times stay in state while a day is switched off, so turning
              // it back on restores what was there rather than a default.
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        ))}
      </div>

      {message ? (
        <p className={message.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save hours'}
      </Button>
    </form>
  );
}
