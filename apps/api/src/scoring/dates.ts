// Day boundaries are Asia/Bangkok (UTC+7, no DST) so "today" matches what Thai users and the seed see.
// ponytail: fixed offset; per-user timezone if users outside Thailand appear.
export const DAY = 86_400_000;
const TZ_OFFSET = 7 * 3_600_000;
export const dayIndex = (d: Date) => Math.floor((d.getTime() + TZ_OFFSET) / DAY);
export const startOfDay = (d: Date) => new Date(dayIndex(d) * DAY - TZ_OFFSET);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
