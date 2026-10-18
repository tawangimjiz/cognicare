import type { PatientStatus, TrendDirection } from '@cognicare/shared';

export function patientStatus(latest: { trendDirection: TrendDirection; flaggedForReview: boolean }[]): PatientStatus {
  if (!latest.length) return 'new';
  if (latest.some((s) => s.flaggedForReview)) return 'watch';
  if (latest.some((s) => s.trendDirection === 'improving')) return 'improving';
  return 'stable';
}
