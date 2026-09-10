import {
  isSlotFull,
  formatClock,
  getBookableDays,
  getTimeSlotsForDay,
  openStatus,
  weekSchedule,
} from '@/lib/scheduling';

describe('getBookableDays', () => {
  it('returns 7 days starting today, labeled Today/Tomorrow then weekday', () => {
    const now = new Date('2026-08-23T10:00:00');
    const days = getBookableDays(now);

    expect(days).toHaveLength(7);
    expect(days[0].label).toBe('Today');
    expect(days[1].label).toBe('Tomorrow');
    expect(days[2].label).not.toBe('Tomorrow');
    expect(days[0].date.getDate()).toBe(23);
    expect(days[6].date.getDate()).toBe(29);
  });
});

describe('getTimeSlotsForDay', () => {
  it('generates half-hour slots across the booking window for a future day', () => {
    const now = new Date('2026-08-23T05:00:00');
    const day = new Date('2026-08-25T00:00:00');
    const slots = getTimeSlotsForDay(day, now);

    expect(slots[0].getHours()).toBe(7);
    expect(slots[0].getMinutes()).toBe(0);
    expect(slots.at(-1)?.getHours()).toBe(20);
    expect(slots.at(-1)?.getMinutes()).toBe(30);
    // 7:00 to 20:30 inclusive, every 30 minutes = 28 slots
    expect(slots).toHaveLength(28);
  });

  it('offers slots outside the shop\'s opening hours', () => {
    // The point of the change: hours say when the shop is staffed, not what may
    // be requested. This shop closes at 17:00 and 19:00 is still offered.
    const now = new Date('2026-08-23T05:00:00');
    const day = new Date('2026-08-25T00:00:00');
    const hours = [
      { weekday: 2, is_open: true, opens_at: '09:00', closes_at: '17:00' },
    ];

    const slots = getTimeSlotsForDay(day, now, hours);
    expect(slots.some((s) => s.getHours() === 19)).toBe(true);
  });

  it('still offers nothing on a date the shop has blocked', () => {
    // A closure is the shop naming a day it will not work, which is a different
    // thing from the hours it usually keeps.
    const now = new Date('2026-08-23T05:00:00');
    const day = new Date('2026-08-25T00:00:00');
    expect(getTimeSlotsForDay(day, now, undefined, [{ closed_on: '2026-08-25' }])).toHaveLength(0);
  });

  it('excludes slots already in the past when the day is today', () => {
    const now = new Date('2026-08-23T13:15:00');
    const day = new Date('2026-08-23T00:00:00');
    const slots = getTimeSlotsForDay(day, now);

    expect(slots[0].getHours()).toBe(13);
    expect(slots[0].getMinutes()).toBe(30);
    expect(slots.every((slot) => slot > now)).toBe(true);
  });

  it('returns an empty list once the booking window for today has passed', () => {
    const now = new Date('2026-08-23T21:30:00');
    const day = new Date('2026-08-23T00:00:00');
    expect(getTimeSlotsForDay(day, now)).toHaveLength(0);
  });
});

const WEEK = [
  { weekday: 0, is_open: false, opens_at: '09:00', closes_at: '18:00' },
  { weekday: 1, is_open: true, opens_at: '09:00', closes_at: '19:00' },
  { weekday: 2, is_open: true, opens_at: '09:00', closes_at: '19:00' },
  { weekday: 3, is_open: true, opens_at: '09:00', closes_at: '19:00' },
  { weekday: 4, is_open: true, opens_at: '09:00', closes_at: '19:00' },
  { weekday: 5, is_open: true, opens_at: '09:00', closes_at: '19:00' },
  { weekday: 6, is_open: true, opens_at: '09:00', closes_at: '19:00' },
];

describe('formatClock', () => {
  it('reads clock strings as people say them', () => {
    expect(formatClock('09:00')).toBe('9:00 am');
    expect(formatClock('19:30')).toBe('7:30 pm');
  });

  it('calls midnight and noon by their twelve-hour names', () => {
    expect(formatClock('00:00')).toBe('12:00 am');
    expect(formatClock('12:00')).toBe('12:00 pm');
  });

  it('returns empty for nonsense rather than "NaN:00"', () => {
    expect(formatClock('')).toBe('');
  });
});

describe('weekSchedule', () => {
  // 2026-08-31 is a Monday.
  const monday = new Date('2026-08-31T10:00:00');

  it('starts at today, not at Sunday', () => {
    const week = weekSchedule(WEEK, monday);
    expect(week).toHaveLength(7);
    expect(week[0].day).toBe('Monday');
    expect(week[0].isToday).toBe(true);
    expect(week[6].day).toBe('Sunday');
    expect(week[6].isToday).toBe(false);
  });

  it('renders a closed day as Closed, not as a zero-length range', () => {
    const week = weekSchedule(WEEK, monday);
    expect(week[6].hours).toBe('Closed');
    expect(week[0].hours).toBe('9:00 am – 7:00 pm');
  });

  it('returns nothing at all when hours have not loaded', () => {
    expect(weekSchedule(undefined, monday)).toEqual([]);
    expect(weekSchedule([], monday)).toEqual([]);
  });
});

describe('openStatus', () => {
  it('says how long is left while the shop is open', () => {
    expect(openStatus(WEEK, [], new Date('2026-08-31T10:00:00'))).toEqual({
      open: true,
      text: 'Open until 7:00 pm',
    });
  });

  it('says when it opens, before it does', () => {
    expect(openStatus(WEEK, [], new Date('2026-08-31T07:00:00'))).toEqual({
      open: false,
      text: 'Opens at 9:00 am',
    });
  });

  it('distinguishes shut-for-now from shut-all-day', () => {
    expect(openStatus(WEEK, [], new Date('2026-08-31T20:00:00')).text).toBe('Closed for today');
    // Sunday.
    expect(openStatus(WEEK, [], new Date('2026-09-06T12:00:00')).text).toBe('Closed today');
  });

  it('lets a blocked day beat the weekly pattern', () => {
    const closed = openStatus(WEEK, [{ closed_on: '2026-08-31' }], new Date('2026-08-31T10:00:00'));
    expect(closed).toEqual({ open: false, text: 'Closed today' });
  });

  it('does not claim to be closed before the hours have loaded', () => {
    expect(openStatus(undefined, [], new Date('2026-08-31T10:00:00'))).toEqual({
      open: false,
      text: 'Hours not set',
    });
  });

  it('is open exactly at opening time and shut exactly at closing time', () => {
    expect(openStatus(WEEK, [], new Date('2026-08-31T09:00:00')).open).toBe(true);
    expect(openStatus(WEEK, [], new Date('2026-08-31T19:00:00')).open).toBe(false);
  });
});

/**
 * The picker's half of capacity. The server refuses an overbooked slot either
 * way; this is what stops a customer finding that out at the end of the form.
 */
describe('isSlotFull', () => {
  // A sixty-hour job, which is what a paint protection booking actually is.
  const busy = [{ starts_at: '2026-08-31T04:30:00.000Z', ends_at: '2026-09-02T16:30:00.000Z' }];

  it('is not full when the shop has nothing on', () => {
    expect(isSlotFull(new Date('2026-08-31T05:00:00.000Z'), 60, [], 1)).toBe(false);
    expect(isSlotFull(new Date('2026-08-31T05:00:00.000Z'), 60, undefined, 1)).toBe(false);
  });

  it('is full in the middle of a long job, not only at its start', () => {
    // A day into a job that runs for two and a half.
    expect(isSlotFull(new Date('2026-09-01T05:00:00.000Z'), 60, busy, 1)).toBe(true);
  });

  it('is free once the job has ended', () => {
    expect(isSlotFull(new Date('2026-09-02T17:00:00.000Z'), 60, busy, 1)).toBe(false);
  });

  it('is free when a long booking starts after this slot ends', () => {
    expect(isSlotFull(new Date('2026-08-31T03:00:00.000Z'), 60, busy, 1)).toBe(false);
  });

  it('counts the job being booked, not just the one already there', () => {
    // A sixty-hour job starting the day before overlaps a booking that has not
    // begun yet, because the new job runs into it.
    expect(isSlotFull(new Date('2026-08-30T04:30:00.000Z'), 3600, busy, 1)).toBe(true);
  });

  it('lets a second job in when the shop has two bays', () => {
    expect(isSlotFull(new Date('2026-09-01T05:00:00.000Z'), 60, busy, 2)).toBe(false);
  });

  it('treats a service with no duration as an hour rather than as nothing', () => {
    // Ending inside the busy interval: with a zero-length job this would read
    // as free and capacity would not apply.
    expect(isSlotFull(new Date('2026-08-31T04:00:00.000Z'), null, busy, 1)).toBe(true);
  });
});
