/**
 * The shop-floor reading of a day's bookings.
 *
 * Pure and dependency-free: which jobs are unassigned, what is in a bay, and
 * what the day is worth are the numbers an owner acts on, so they are worth
 * testing without standing up the app.
 */

export interface BoardBooking {
  id: string;
  scheduled_at: string;
  status: string;
  net_price: number;
  technician_id: string | null;
  payment_method: string;
  payments?: { status: string }[] | null;
  /** Used to work out when a job that is running frees somebody up. */
  services?: { duration_minutes: number | null } | null;
}

/** Statuses where the job is still live — the shop still owes work on it. */
const OPEN_STATUSES = ['pending_payment', 'confirmed', 'assigned', 'in_progress'];

export function isSameDay(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function todaysBookings<T extends BoardBooking>(bookings: T[] | undefined, now?: Date): T[] {
  return (bookings ?? []).filter((b) => isSameDay(b.scheduled_at, now));
}

/**
 * Everything the shop still owes work on, whenever it was scheduled.
 *
 * The board's queues are built from this rather than from today's bookings.
 * They used to be today-only, which meant a job nobody got to yesterday
 * disappeared overnight: still unassigned, still in progress, still owed to a
 * customer, and no longer anywhere in the app. A queue that empties itself by
 * the passage of time is not a queue.
 *
 * The day statistics stay on today, because "booked today" means today.
 */
export function openBookings<T extends BoardBooking>(bookings: T[] | undefined): T[] {
  return (bookings ?? []).filter((b) => OPEN_STATUSES.includes(b.status));
}

/** Before today, and therefore late however the shop feels about it. */
export function isOverdue(iso: string, now: Date = new Date()): boolean {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(iso) < startOfToday;
}

/**
 * When a job is, written for someone reading a list that is no longer all one
 * day. The time alone said "5:00 pm" on a job from last Tuesday.
 */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  if (isSameDay(iso, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(iso, yesterday)) return `Yesterday, ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(iso, tomorrow)) return `Tomorrow, ${time}`;

  // Weekday and date formatted separately: asking for both at once puts a comma
  // after the weekday, so the line came out as "Sun, 23 Aug, 10:00 am".
  const weekday = at.toLocaleDateString('en-IN', { weekday: 'short' });
  const date = at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${weekday} ${date}, ${time}`;
}

/**
 * Jobs confirmed but with nobody on them — the queue the Inbox exists to empty.
 *
 * `pending_payment` is deliberately excluded: assigning someone to a job the
 * customer has not paid for commits a bay to money that may never arrive.
 */
export function needsAssignment<T extends BoardBooking>(bookings: T[]): T[] {
  return bookings
    .filter((b) => b.status === 'confirmed' && !b.technician_id)
    // Oldest first. Now that the queue spans days, the job that has been
    // waiting longest is the one to deal with, and it is the one a
    // newest-first list would bury.
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

/** Jobs with someone on them, in the order they are happening. */
export function inTheBay<T extends BoardBooking>(bookings: T[]): T[] {
  return bookings
    .filter((b) => b.technician_id && b.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

/**
 * What the day is worth. Cancelled jobs earn nothing, and net_price is used
 * rather than the gross so discounts and promo codes are already off.
 */
export function bookedToday<T extends BoardBooking>(bookings: T[]): number {
  return bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + Number(b.net_price ?? 0), 0);
}

/** How many jobs still have work left in them today. */
export function jobsLeft<T extends BoardBooking>(bookings: T[]): number {
  return bookings.filter((b) => OPEN_STATUSES.includes(b.status)).length;
}

/**
 * Cash the shop is owed: completed COD jobs with no settled payment against
 * them. This is the number that goes missing if nobody is watching for it.
 */
export function cashToCollect<T extends BoardBooking>(bookings: T[]): number {
  return bookings
    .filter(
      (b) =>
        b.status === 'completed' &&
        b.payment_method === 'cod' &&
        !(b.payments ?? []).some((p) => p.status === 'paid'),
    )
    .reduce((sum, b) => sum + Number(b.net_price ?? 0), 0);
}

export type StatusTone = 'unassigned' | 'assigned' | 'working' | 'cashDue' | 'done' | 'cancelled';

/**
 * The one label a job wears on the board.
 *
 * "Cash due" beats "Done" deliberately: a finished job with money outstanding
 * is not finished from the shop's point of view, and showing it as done is how
 * uncollected cash gets forgotten.
 */
export function statusTone<T extends BoardBooking>(b: T): StatusTone {
  if (b.status === 'cancelled') return 'cancelled';
  if (b.status === 'in_progress') return 'working';
  if (b.status === 'completed') {
    const settled = (b.payments ?? []).some((p) => p.status === 'paid');
    return b.payment_method === 'cod' && !settled ? 'cashDue' : 'done';
  }
  if (b.technician_id) return 'assigned';
  return 'unassigned';
}

export type JobAction = 'assign' | 'start' | 'complete' | 'collect' | null;

/**
 * The one thing to do next with a job.
 *
 * Exactly one action, never a row of buttons: on a workshop floor the useful
 * question is "what now", and offering four choices makes the operator answer
 * it themselves. Everything else stays reachable through the detail screen.
 *
 * `pending_payment` deliberately returns nothing — the shop is waiting on the
 * customer, and there is no action here that helps.
 */
export function nextAction<T extends BoardBooking>(b: T): JobAction {
  if (b.status === 'cancelled' || b.status === 'pending_payment') return null;

  if (b.status === 'completed') {
    const settled = (b.payments ?? []).some((p) => p.status === 'paid');
    return b.payment_method === 'cod' && !settled ? 'collect' : null;
  }

  if (!b.technician_id) return 'assign';
  if (b.status === 'assigned') return 'start';
  if (b.status === 'in_progress') return 'complete';
  return null;
}

export const TONE_LABELS: Record<StatusTone, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  working: 'In progress',
  cashDue: 'Cash due',
  done: 'Done',
  cancelled: 'Cancelled',
};

export interface BoardTechnician {
  id: string;
  name: string;
  status: string;
}

export interface TechnicianSuggestion {
  technicianId: string;
  name: string;
  /** When they come free, if they are mid-job now. Null means free already. */
  freeFrom: Date | null;
  /** When their next job starts. Null when the rest of the day is clear. */
  freeUntil: Date | null;
}

/** Assumed job length when a service has no duration set. */
const DEFAULT_JOB_MINUTES = 60;

function endOf<T extends BoardBooking>(b: T): number {
  const minutes = b.services?.duration_minutes ?? DEFAULT_JOB_MINUTES;
  return new Date(b.scheduled_at).getTime() + minutes * 60_000;
}

/**
 * Who to put on an unassigned job, offered as a one-tap suggestion.
 *
 * Availability only. The board carries no skill or category data, so this
 * answers "who is free", never "who is best" — it is a shortcut past the assign
 * sheet, not a replacement for it, and the sheet still opens for any other
 * choice.
 *
 * Somebody mid-job is still offered, with the time they come free, because on
 * a busy day that is the real answer: "Vignesh, from 3pm" beats "nobody", and
 * the owner is the one who decides whether that is soon enough.
 *
 * Free now beats free later; among equals, the longest clear run wins, so a
 * twenty-minute job does not eat the one person who could still take a full
 * detail.
 */
export function suggestTechnician<T extends BoardBooking>(
  booking: T,
  technicians: BoardTechnician[] | undefined,
  bookings: T[] | undefined,
  now: Date = new Date(),
): TechnicianSuggestion | null {
  const day = todaysBookings(bookings, now);
  const from = new Date(booking.scheduled_at).getTime();

  const candidates = (technicians ?? [])
    .filter((t) => t.status === 'active')
    .map((t) => {
      const theirs = day.filter((b) => b.technician_id === t.id && b.id !== booking.id);

      // Mid-job right now: they are free when it finishes, not before.
      const running = theirs
        .filter((b) => b.status === 'in_progress')
        .map(endOf)
        .sort((a, b) => b - a)[0];
      const freeFrom = running !== undefined && running > from ? new Date(running) : null;

      const readyAt = freeFrom ? freeFrom.getTime() : from;
      const next = theirs
        .filter(
          (b) =>
            OPEN_STATUSES.includes(b.status) &&
            b.status !== 'in_progress' &&
            new Date(b.scheduled_at).getTime() > readyAt,
        )
        .map((b) => new Date(b.scheduled_at).getTime())
        .sort((a, b) => a - b)[0];

      return {
        technicianId: t.id,
        name: t.name,
        freeFrom,
        freeUntil: next === undefined ? null : new Date(next),
      };
    });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // Free now first; then whoever comes free soonest.
    const af = a.freeFrom ? a.freeFrom.getTime() : 0;
    const bf = b.freeFrom ? b.freeFrom.getTime() : 0;
    if (af !== bf) return af - bf;

    const au = a.freeUntil ? a.freeUntil.getTime() : Infinity;
    const bu = b.freeUntil ? b.freeUntil.getTime() : Infinity;
    if (au !== bu) return bu - au;

    // Name last, so the same board always suggests the same person rather than
    // reshuffling under the owner's thumb between refetches.
    return a.name.localeCompare(b.name);
  });

  return candidates[0];
}

export interface ActivityPayment {
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  razorpay_order_id?: string | null;
}

export interface ActivityStatusEvent {
  event: string;
  created_at: string;
  technicians?: { name: string } | null;
}

export interface ActivityJob {
  created_at: string;
  payment_method: string;
  payments?: ActivityPayment[] | null;
  booking_events?: ActivityStatusEvent[] | null;
}

const EVENT_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  reassigned: 'Reassigned',
  unassigned: 'Technician removed',
  started: 'Work started',
  completed: 'Job completed',
  cancelled: 'Cancelled',
  reopened: 'Reopened',
};

const EVENT_TONES: Record<string, ActivityEvent['tone']> = {
  completed: 'good',
  cancelled: 'bad',
  unassigned: 'bad',
};

export interface ActivityEvent {
  key: string;
  label: string;
  at: Date;
  tone: 'neutral' | 'good' | 'bad';
}

/**
 * What has actually happened to a job, in order.
 *
 * Three sources, one thread: the booking itself, its payments, and the history
 * rows the booking_events trigger writes on every status or technician change.
 *
 * Everything here is a recorded timestamp, never an inferred one. Jobs created
 * before that trigger existed simply have a shorter timeline rather than a
 * fabricated one — a guessed "started" time would be most wrong exactly when a
 * job ran late, which is when somebody would be reading it.
 *
 * A paid row is dated by `updated_at`, not `created_at`: the row is opened when
 * checkout starts and settled when the money lands, and it is the second one
 * that belongs on a timeline.
 */
export function jobActivity(job: ActivityJob): ActivityEvent[] {
  const online = job.payment_method !== 'cod';
  const events: ActivityEvent[] = [];

  const booked = new Date(job.created_at);
  if (!Number.isNaN(booked.getTime())) {
    events.push({ key: 'booked', label: 'Booked in the app', at: booked, tone: 'neutral' });
  }

  (job.payments ?? []).forEach((p, i) => {
    const settledAt = p.updated_at ?? p.created_at;
    const openedAt = p.created_at ?? p.updated_at;

    let label: string | null = null;
    let stamp: string | null | undefined = settledAt;
    let tone: ActivityEvent['tone'] = 'neutral';

    if (p.status === 'paid') {
      label = online
        ? p.razorpay_order_id
          ? 'Paid online · Razorpay'
          : 'Paid online'
        : 'Cash collected';
      tone = 'good';
    } else if (p.status === 'failed') {
      label = 'Payment failed';
      tone = 'bad';
    } else if (p.status === 'refunded') {
      label = 'Refunded';
      tone = 'bad';
    } else if (p.status === 'created') {
      // Not yet money. For cash this is the shop waiting on the customer at
      // handover, which is worth saying plainly rather than calling it pending.
      label = online ? 'Payment started' : 'Cash due on collection';
      stamp = openedAt;
    }

    if (!label || !stamp) return;
    const at = new Date(stamp);
    if (Number.isNaN(at.getTime())) return;

    events.push({ key: `payment-${i}`, label, at, tone });
  });

  (job.booking_events ?? []).forEach((e, i) => {
    const label = EVENT_LABELS[e.event];
    if (!label) return; // An event this build does not know about yet.

    const at = new Date(e.created_at);
    if (Number.isNaN(at.getTime())) return;

    // "Assigned to Arun" reads as one fact; "Assigned" plus a name column does
    // not. Only the events that are *about* a person take one.
    const who = e.technicians?.name;
    const named = who && (e.event === 'assigned' || e.event === 'reassigned');

    events.push({
      key: `event-${i}`,
      label: named ? `${label} to ${who}` : label,
      at,
      tone: EVENT_TONES[e.event] ?? 'neutral',
    });
  });

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
