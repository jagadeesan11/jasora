export const SLOT_MINUTES = 30;

/** Fallback used only until the shop's real hours arrive from the database. */
export const DEFAULT_HOURS = { opensAt: '09:00', closesAt: '18:00' } as const;

/**
 * The span of the day the picker offers, for every shop.
 *
 * Deliberately not the shop's opening hours. Those say when the shop is
 * staffed — the app shows them on the shop card so a customer knows when to
 * turn up — and they no longer decide what may be booked: a request outside
 * them is one the shop accepts, moves or declines when it confirms the job.
 *
 * A window is still needed, because a picker has to offer something and
 * forty-eight slots from midnight is not a usable list. This one is wide
 * enough to cover an early drop-off and a late collection, and it is a
 * property of the product rather than of any shop.
 */
export const BOOKING_WINDOW = { opensAt: '07:00', closesAt: '21:00' } as const;

export interface BusinessHours {
  /** 0 = Sunday, matching JavaScript's getDay() and Postgres's extract(dow). */
  weekday: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
}

export interface ShopClosure {
  closed_on: string;
}

export interface BookableDay {
  date: Date;
  label: string;
  /** False when the shop is shut that day — the chip is shown, not hidden. */
  open: boolean;
  reason: string | null;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hoursFor(day: Date, hours: BusinessHours[] | undefined): BusinessHours | null {
  return (hours ?? []).find((h) => h.weekday === day.getDay()) ?? null;
}

export function isClosedOn(day: Date, closures: ShopClosure[] | undefined): boolean {
  const key = isoDate(day);
  return (closures ?? []).some((c) => c.closed_on === key);
}

/**
 * The next seven days, each marked open or shut.
 *
 * Closed days are kept in the list rather than dropped: a customer who sees
 * "Sunday — closed" learns something, whereas a Sunday that silently is not
 * there reads as a bug in the app.
 */
export function getBookableDays(
  now: Date = new Date(),
  hours?: BusinessHours[],
  closures?: ShopClosure[],
): BookableDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + i);

    let label: string;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else
      label = date.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

    // A closure beats the weekly pattern: it is the shop saying "not that day"
    // whatever the usual hours are.
    if (isClosedOn(date, closures)) {
      return { date, label, open: false, reason: 'Closed' };
    }

    // A day the shop does not usually work is still bookable. The weekly
    // pattern describes when it is staffed, not what it will accept, and the
    // shop confirms every booking by hand anyway. Only a blocked date above
    // takes a day out.
    return { date, label, open: true, reason: null };
  });
}

/**
 * Bookable slots for a day.
 *
 * The span is BOOKING_WINDOW, the same for every shop, not the shop's opening
 * hours — those are shown elsewhere as information and no longer decide what
 * can be requested. The server agrees: create_booking refuses a blocked date
 * and nothing else about the clock.
 *
 * `hours` is still accepted so the signature and every call site are unchanged,
 * and so this can go back to consulting them if that turns out to be wanted.
 * Past slots are still dropped — nobody can book backwards.
 */
export function getTimeSlotsForDay(
  day: Date,
  now: Date = new Date(),
  _hours?: BusinessHours[],
  closures?: ShopClosure[],
): Date[] {
  // A blocked date is the shop naming a day it will not work, which is a
  // different thing from the hours it usually keeps.
  if (isClosedOn(day, closures)) return [];

  const opens = minutesOf(BOOKING_WINDOW.opensAt);
  const closes = minutesOf(BOOKING_WINDOW.closesAt);

  const slots: Date[] = [];
  for (let m = opens; m < closes; m += SLOT_MINUTES) {
    const slot = new Date(day);
    slot.setHours(Math.floor(m / 60), m % 60, 0, 0);
    if (slot > now) slots.push(slot);
  }
  return slots;
}

/**
 * "09:00" as "9:00 am". Times are stored as clock strings, not dates.
 *
 * The shape is checked rather than just parsed: Number('') is 0, so a missing
 * time would otherwise render as a confident "12:00 am" and a shop with no
 * hours set would advertise midnight to midnight.
 */
export function formatClock(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!match) return '';

  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return '';

  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface ScheduleLine {
  /** 0 = Sunday, matching getDay() and Postgres's extract(dow). */
  weekday: number;
  day: string;
  /** "9:00 am – 7:00 pm", or "Closed". */
  hours: string;
  isToday: boolean;
}

/**
 * The week as a customer reads it.
 *
 * Ordered from today rather than from Sunday: someone checking opening hours
 * is nearly always asking about today or tomorrow, and making them find the
 * current day in a fixed list is work the screen can do for them.
 */
export function weekSchedule(hours: BusinessHours[] | undefined, now: Date = new Date()): ScheduleLine[] {
  const today = now.getDay();
  if (!hours || hours.length === 0) return [];

  return Array.from({ length: 7 }, (_, i) => {
    const weekday = (today + i) % 7;
    const h = hours.find((row) => row.weekday === weekday);
    return {
      weekday,
      day: WEEKDAY_NAMES[weekday],
      hours:
        h && h.is_open ? `${formatClock(h.opens_at)} – ${formatClock(h.closes_at)}` : 'Closed',
      isToday: i === 0,
    };
  });
}

export interface OpenStatus {
  open: boolean;
  /** One line, ready to print. */
  text: string;
}

/**
 * Whether the shop is open right now, and the sentence that says so.
 *
 * A blocked day beats the weekly pattern, the same way it does when booking —
 * this is the same question the picker asks, so it has to give the same answer.
 */
export function openStatus(
  hours: BusinessHours[] | undefined,
  closures: ShopClosure[] | undefined,
  now: Date = new Date(),
): OpenStatus {
  if (!hours || hours.length === 0) return { open: false, text: 'Hours not set' };

  if (isClosedOn(now, closures)) return { open: false, text: 'Closed today' };

  const h = hoursFor(now, hours);
  if (!h || !h.is_open) return { open: false, text: 'Closed today' };

  const minutes = now.getHours() * 60 + now.getMinutes();
  const opens = minutesOf(h.opens_at);
  const closes = minutesOf(h.closes_at);

  if (minutes < opens) return { open: false, text: `Opens at ${formatClock(h.opens_at)}` };
  if (minutes >= closes) return { open: false, text: 'Closed for today' };
  return { open: true, text: `Open until ${formatClock(h.closes_at)}` };
}

/** A stretch of time a shop already has work in. */
export interface BusyInterval {
  starts_at: string;
  ends_at: string;
}

/**
 * Whether a slot is already full.
 *
 * The same rule create_booking enforces, run on the phone so the picker can
 * grey a slot out rather than letting someone choose a vehicle, an address and
 * a time before being told the bay was taken. The server stays the authority —
 * two people tapping at the same instant can only be settled where the write
 * happens — so this is about not wasting a customer's time, not about
 * correctness.
 *
 * Overlap, not equality: booking into the middle of a sixty-hour job has to
 * count, and comparing start times would miss it.
 */
export function isSlotFull(
  slot: Date,
  durationMinutes: number | null,
  busy: BusyInterval[] | undefined,
  concurrentJobs: number,
): boolean {
  if (!busy || busy.length === 0) return false;

  const start = slot.getTime();
  // The same floor the server applies. Without it a service with no duration
  // would never overlap anything and capacity would quietly not apply to it.
  const end = start + (durationMinutes ?? 60) * 60_000;

  const overlapping = busy.filter((b) => {
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = new Date(b.ends_at).getTime();
    return bStart < end && start < bEnd;
  }).length;

  return overlapping >= Math.max(1, concurrentJobs);
}
