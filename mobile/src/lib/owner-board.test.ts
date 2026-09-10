import {
  isOverdue,
  jobActivity,
  needsAssignment,
  openBookings,
  suggestTechnician,
  whenLabel,
  type BoardBooking,
  type BoardTechnician,
} from '@/lib/owner-board';

const NOW = new Date('2026-08-30T09:00:00');

function booking(over: Partial<BoardBooking> & { id: string; scheduled_at: string }): BoardBooking {
  return {
    status: 'confirmed',
    net_price: 1000,
    technician_id: null,
    payment_method: 'cod',
    ...over,
  };
}

const ARUN: BoardTechnician = { id: 't-arun', name: 'Arun Prakash', status: 'active' };
const VIGNESH: BoardTechnician = { id: 't-vig', name: 'Vignesh Kumar', status: 'active' };

describe('suggestTechnician', () => {
  const job = booking({ id: 'j1', scheduled_at: '2026-08-30T11:00:00' });

  it('returns null when nobody is on the team', () => {
    expect(suggestTechnician(job, [], [job], NOW)).toBeNull();
    expect(suggestTechnician(job, undefined, [job], NOW)).toBeNull();
  });

  it('skips technicians who are stood down', () => {
    const off = [{ ...ARUN, status: 'inactive' }];
    expect(suggestTechnician(job, off, [job], NOW)).toBeNull();
  });

  it('reports a clear day as free now, with no end', () => {
    const pick = suggestTechnician(job, [ARUN], [job], NOW);
    expect(pick?.technicianId).toBe(ARUN.id);
    expect(pick?.freeFrom).toBeNull();
    expect(pick?.freeUntil).toBeNull();
  });

  it('caps free time at the next job that starts after this one', () => {
    const later = booking({
      id: 'j3',
      scheduled_at: '2026-08-30T14:00:00',
      status: 'assigned',
      technician_id: ARUN.id,
    });
    const pick = suggestTechnician(job, [ARUN], [job, later], NOW);
    expect(pick?.freeUntil?.getHours()).toBe(14);
  });

  it('ignores a job that starts before the one being assigned', () => {
    const earlier = booking({
      id: 'j4',
      scheduled_at: '2026-08-30T09:30:00',
      status: 'assigned',
      technician_id: ARUN.id,
    });
    const pick = suggestTechnician(job, [ARUN], [job, earlier], NOW);
    expect(pick?.freeUntil).toBeNull();
  });

  it('ignores a cancelled job when working out free time', () => {
    const scrapped = booking({
      id: 'j5',
      scheduled_at: '2026-08-30T14:00:00',
      status: 'cancelled',
      technician_id: ARUN.id,
    });
    const pick = suggestTechnician(job, [ARUN], [job, scrapped], NOW);
    expect(pick?.freeUntil).toBeNull();
  });

  it('offers somebody mid-job with the time they come free', () => {
    // Running 10:00 + 4h, so free from 14:00 — after the 11:00 slot.
    const running = booking({
      id: 'j6',
      scheduled_at: '2026-08-30T10:00:00',
      status: 'in_progress',
      technician_id: ARUN.id,
      services: { duration_minutes: 240 },
    });
    const pick = suggestTechnician(job, [ARUN], [job, running], NOW);
    expect(pick?.technicianId).toBe(ARUN.id);
    expect(pick?.freeFrom?.getHours()).toBe(14);
  });

  it('assumes an hour when a service carries no duration', () => {
    const running = booking({
      id: 'j7',
      scheduled_at: '2026-08-30T10:30:00',
      status: 'in_progress',
      technician_id: ARUN.id,
    });
    const pick = suggestTechnician(job, [ARUN], [job, running], NOW);
    expect(pick?.freeFrom?.getHours()).toBe(11);
    expect(pick?.freeFrom?.getMinutes()).toBe(30);
  });

  it('treats a job finishing before the slot as no constraint at all', () => {
    const running = booking({
      id: 'j8',
      scheduled_at: '2026-08-30T09:00:00',
      status: 'in_progress',
      technician_id: ARUN.id,
      services: { duration_minutes: 30 },
    });
    const pick = suggestTechnician(job, [ARUN], [job, running], NOW);
    expect(pick?.freeFrom).toBeNull();
  });

  it('prefers whoever is free now over whoever is still working', () => {
    const running = booking({
      id: 'j9',
      scheduled_at: '2026-08-30T10:00:00',
      status: 'in_progress',
      technician_id: ARUN.id,
      services: { duration_minutes: 240 },
    });
    const pick = suggestTechnician(job, [ARUN, VIGNESH], [job, running], NOW);
    expect(pick?.technicianId).toBe(VIGNESH.id);
    expect(pick?.freeFrom).toBeNull();
  });

  it('prefers the longest clear run between two who are both free', () => {
    const arunBusyAt2 = booking({
      id: 'j10',
      scheduled_at: '2026-08-30T14:00:00',
      status: 'assigned',
      technician_id: ARUN.id,
    });
    const vigBusyAt5 = booking({
      id: 'j11',
      scheduled_at: '2026-08-30T17:00:00',
      status: 'assigned',
      technician_id: VIGNESH.id,
    });
    const pick = suggestTechnician(job, [ARUN, VIGNESH], [job, arunBusyAt2, vigBusyAt5], NOW);
    expect(pick?.technicianId).toBe(VIGNESH.id);
  });

  it('breaks ties by name, so the board does not reshuffle between refetches', () => {
    const a = suggestTechnician(job, [ARUN, VIGNESH], [job], NOW);
    const b = suggestTechnician(job, [VIGNESH, ARUN], [job], NOW);
    expect(a?.technicianId).toBe(ARUN.id);
    expect(b?.technicianId).toBe(ARUN.id);
  });

  it("does not count a different day's work against today", () => {
    const tomorrow = booking({
      id: 'j12',
      scheduled_at: '2026-08-31T10:00:00',
      status: 'assigned',
      technician_id: ARUN.id,
    });
    const pick = suggestTechnician(job, [ARUN], [job, tomorrow], NOW);
    expect(pick?.freeUntil).toBeNull();
  });
});

describe('jobActivity', () => {
  const BOOKED = '2026-08-30T07:10:00';

  it('always opens with the booking itself', () => {
    const events = jobActivity({ created_at: BOOKED, payment_method: 'razorpay' });
    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('Booked in the app');
    expect(events[0].at.getHours()).toBe(7);
  });

  it('dates an online payment by when it settled, not when checkout opened', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [
        {
          status: 'paid',
          created_at: '2026-08-30T07:10:30',
          updated_at: '2026-08-30T07:11:00',
          razorpay_order_id: 'order_abc',
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[1].label).toBe('Paid online · Razorpay');
    expect(events[1].at.getMinutes()).toBe(11);
    expect(events[1].tone).toBe('good');
  });

  it('names a paid cash job as collected, not paid online', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      payments: [{ status: 'paid', created_at: BOOKED, updated_at: '2026-08-30T18:00:00' }],
    });
    expect(events[1].label).toBe('Cash collected');
    expect(events[1].at.getHours()).toBe(18);
  });

  it('says cash is still due while the row is unsettled', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      payments: [{ status: 'created', created_at: BOOKED, updated_at: BOOKED }],
    });
    expect(events[1].label).toBe('Cash due on collection');
    expect(events[1].tone).toBe('neutral');
  });

  it('records failures and refunds', () => {
    const failed = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [{ status: 'failed', created_at: BOOKED, updated_at: '2026-08-30T07:12:00' }],
    });
    expect(failed[1].label).toBe('Payment failed');
    expect(failed[1].tone).toBe('bad');

    const refunded = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [{ status: 'refunded', created_at: BOOKED, updated_at: '2026-08-31T09:00:00' }],
    });
    expect(refunded[1].label).toBe('Refunded');
    expect(refunded[1].tone).toBe('bad');
  });

  it('drops "Razorpay" when there is no order behind the payment', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [{ status: 'paid', created_at: BOOKED, updated_at: BOOKED }],
    });
    expect(events[1].label).toBe('Paid online');
  });

  it('orders everything by time, whatever order the rows arrive in', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [
        { status: 'paid', created_at: BOOKED, updated_at: '2026-08-30T09:00:00' },
        { status: 'failed', created_at: BOOKED, updated_at: '2026-08-30T08:00:00' },
      ],
    });
    expect(events.map((e) => e.label)).toEqual([
      'Booked in the app',
      'Payment failed',
      'Paid online',
    ]);
  });

  it('skips rows with no usable timestamp rather than showing Invalid Date', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [
        { status: 'paid', created_at: null, updated_at: null },
        { status: 'paid', created_at: 'not-a-date', updated_at: 'not-a-date' },
      ],
    });
    expect(events).toHaveLength(1);
  });

  it('copes with no payment rows at all', () => {
    expect(jobActivity({ created_at: BOOKED, payment_method: 'cod', payments: null })).toHaveLength(
      1,
    );
  });
});

describe('jobActivity with booking history', () => {
  const BOOKED = '2026-08-30T07:10:00';

  it('threads status events in with the payments, in time order', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'razorpay',
      payments: [{ status: 'paid', created_at: BOOKED, updated_at: '2026-08-30T07:11:00' }],
      booking_events: [
        { event: 'completed', created_at: '2026-08-30T13:30:00' },
        { event: 'confirmed', created_at: '2026-08-30T07:11:05' },
        {
          event: 'assigned',
          created_at: '2026-08-30T09:05:00',
          technicians: { name: 'Arun Prakash' },
        },
        { event: 'started', created_at: '2026-08-30T09:20:00' },
      ],
    });

    expect(events.map((e) => e.label)).toEqual([
      'Booked in the app',
      'Paid online',
      'Confirmed',
      'Assigned to Arun Prakash',
      'Work started',
      'Job completed',
    ]);
  });

  it('names the person only on events that are about a person', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      booking_events: [
        { event: 'started', created_at: '2026-08-30T09:20:00', technicians: { name: 'Karthik' } },
        {
          event: 'reassigned',
          created_at: '2026-08-30T09:00:00',
          technicians: { name: 'Karthik' },
        },
      ],
    });
    expect(events[1].label).toBe('Reassigned to Karthik');
    expect(events[2].label).toBe('Work started');
  });

  it('tones completion good and cancellation bad', () => {
    const done = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      booking_events: [{ event: 'completed', created_at: '2026-08-30T13:00:00' }],
    });
    expect(done[1].tone).toBe('good');

    const off = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      booking_events: [{ event: 'cancelled', created_at: '2026-08-30T13:00:00' }],
    });
    expect(off[1].tone).toBe('bad');
  });

  it('ignores an event kind this build does not recognise', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      booking_events: [{ event: 'teleported', created_at: '2026-08-30T13:00:00' }],
    });
    expect(events).toHaveLength(1);
  });

  it('leaves a pre-trigger booking with a short timeline, not a fabricated one', () => {
    const events = jobActivity({
      created_at: BOOKED,
      payment_method: 'cod',
      booking_events: [],
    });
    expect(events.map((e) => e.label)).toEqual(['Booked in the app']);
  });
});

/**
 * The inbox used to build its queues from today's bookings only, so a job
 * nobody got to yesterday vanished overnight — still unassigned, still owed to
 * a customer, and nowhere in the app. These cover the queue that replaced it.
 */
describe('open work', () => {
  const yesterday = '2026-08-29T14:00:00';
  const lastWeek = '2026-08-23T10:00:00';

  it('keeps unfinished work from previous days', () => {
    const open = openBookings([
      booking({ id: 'a', scheduled_at: lastWeek, status: 'in_progress', technician_id: 't-arun' }),
      booking({ id: 'b', scheduled_at: yesterday, status: 'confirmed' }),
      booking({ id: 'c', scheduled_at: '2026-08-30T11:00:00' }),
    ]);
    expect(open.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops work that is finished or called off, whenever it was', () => {
    const open = openBookings([
      booking({ id: 'done', scheduled_at: yesterday, status: 'completed' }),
      booking({ id: 'off', scheduled_at: yesterday, status: 'cancelled' }),
      booking({ id: 'live', scheduled_at: yesterday, status: 'assigned', technician_id: 't-arun' }),
    ]);
    expect(open.map((b) => b.id)).toEqual(['live']);
  });

  it('puts the job that has waited longest at the top of the queue', () => {
    const queue = needsAssignment([
      booking({ id: 'today', scheduled_at: '2026-08-30T11:00:00' }),
      booking({ id: 'last-week', scheduled_at: lastWeek }),
      booking({ id: 'yesterday', scheduled_at: yesterday }),
    ]);
    expect(queue.map((b) => b.id)).toEqual(['last-week', 'yesterday', 'today']);
  });

  it('counts a job before today as overdue, and one later today as not', () => {
    expect(isOverdue(yesterday, NOW)).toBe(true);
    // 09:00 now, scheduled 14:00 — late is not the same as another day.
    expect(isOverdue('2026-08-30T14:00:00', NOW)).toBe(false);
    expect(isOverdue('2026-08-30T08:00:00', NOW)).toBe(false);
  });

  it('says which day a job is on once the list spans more than one', () => {
    expect(whenLabel('2026-08-30T14:00:00', NOW)).not.toMatch(/,/);
    expect(whenLabel(yesterday, NOW)).toMatch(/^Yesterday, /);
    expect(whenLabel('2026-08-31T14:00:00', NOW)).toMatch(/^Tomorrow, /);
    expect(whenLabel(lastWeek, NOW)).toMatch(/^Sun 23 Aug, /);
  });
});
