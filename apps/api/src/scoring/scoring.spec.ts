import { normalize } from './scoring';
import { computeTrend } from './trend';
import { patientStatus } from './status';

describe('normalize', () => {
  it('scales and rounds to 2 dp', () => {
    expect(normalize(50, 100)).toBe(50);
    expect(normalize(1, 3)).toBe(33.33);
  });
  it('clamps to 0..100', () => {
    expect(normalize(150, 100)).toBe(100);
    expect(normalize(-5, 100)).toBe(0);
  });
  it('throws when maxRaw <= 0', () => {
    expect(() => normalize(1, 0)).toThrow();
    expect(() => normalize(1, -1)).toThrow();
  });
});

describe('computeTrend', () => {
  it('null prev is stable', () => expect(computeTrend(70, null)).toEqual({ direction: 'stable', flagged: false }));
  it('+5 is improving, +4.99 stable', () => {
    expect(computeTrend(55, 50).direction).toBe('improving');
    expect(computeTrend(54.99, 50).direction).toBe('stable');
  });
  it('-5 is declining and flagged, -4.99 stable', () => {
    expect(computeTrend(45, 50)).toEqual({ direction: 'declining', flagged: true });
    expect(computeTrend(45.01, 50).direction).toBe('stable');
  });
  it('flags when cur < 40 even if stable; 40 is not flagged', () => {
    expect(computeTrend(39.9, 40)).toEqual({ direction: 'stable', flagged: true });
    expect(computeTrend(40, 40).flagged).toBe(false);
  });
});

describe('patientStatus', () => {
  const s = (trendDirection: any, flaggedForReview = false) => ({ trendDirection, flaggedForReview });
  it('new / watch / improving / stable', () => {
    expect(patientStatus([])).toBe('new');
    expect(patientStatus([s('improving'), s('declining', true)])).toBe('watch');
    expect(patientStatus([s('stable'), s('improving')])).toBe('improving');
    expect(patientStatus([s('stable')])).toBe('stable');
  });
});
