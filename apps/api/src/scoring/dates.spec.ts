import { dayIndex, startOfDay } from './dates';

describe('dates (Asia/Bangkok day boundaries)', () => {
  it('splits days at 17:00 UTC (00:00 Bangkok)', () => {
    expect(dayIndex(new Date('2026-10-18T16:59:59Z'))).toBe(dayIndex(new Date('2026-10-18T00:00:00Z')));
    expect(dayIndex(new Date('2026-10-18T17:00:00Z'))).toBe(dayIndex(new Date('2026-10-18T16:59:59Z')) + 1);
    expect(startOfDay(new Date('2026-10-18T18:29:00Z')).toISOString()).toBe('2026-10-18T17:00:00.000Z');
  });
});
