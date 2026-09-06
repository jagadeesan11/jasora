import {
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
