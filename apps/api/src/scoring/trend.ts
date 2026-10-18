import type { TrendDirection } from '@cognicare/shared';

export function computeTrend(curAvg: number, prevAvg: number | null): { direction: TrendDirection; flagged: boolean } {
  let direction: TrendDirection = 'stable';
  if (prevAvg !== null) {
    const delta = curAvg - prevAvg;
    if (delta >= 5) direction = 'improving';
    else if (delta <= -5) direction = 'declining';
  }
  return { direction, flagged: direction === 'declining' || curAvg < 40 };
}
