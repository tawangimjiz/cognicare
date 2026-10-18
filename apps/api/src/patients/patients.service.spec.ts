import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.service';

const NOW = new Date('2026-03-31T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86400000);
const doctor = { id: 'd1', role: 'doctor', jti: 'j' } as const;
const caregiver = { id: 'c1', role: 'caregiver', jti: 'j' } as const;

const prof = (id: string, name: string, extra: any = {}) => ({
  patientId: id, user: { fullName: name }, dateOfBirth: new Date('1956-03-31T00:00:00Z'), baselineMocaScore: 24, ...extra,
});
const prog = (status: string, lastSessionAt: string | null, over: any = {}) => ({
  patientId: 'x', status, totalSessions: lastSessionAt ? 5 : 0, lastSessionAt, sparkline: [1, 2, 3, 4, 5, 6, 7],
  today: { games: 2 }, domains: [10, 20, 0, 0, 30, 0].map((c) => ({ current: c, baseline: c - 5 })), ...over,
});
const snap = (patientId: string, domainId: number, avg: number, flagged: boolean, dir = 'stable', age = 0) => ({
  patientId, domainId, avgNormalizedScore: avg, flaggedForReview: flagged, trendDirection: dir, createdAt: day(age),
});

function setup(profiles: any[], progressById: Record<string, any>, snaps: any[] = [], recent: any[] = []) {
  const prisma: any = {
    patientProfile: { findMany: jest.fn().mockResolvedValue(profiles), findUnique: jest.fn().mockResolvedValue(profiles[0] ?? null) },
    cognitiveTrendSnapshot: { findMany: jest.fn().mockResolvedValue(snaps) },
    gameSession: { findMany: jest.fn().mockResolvedValue(recent) },
  };
  const progress: any = { get: jest.fn(async (id: string) => progressById[id]) };
  return { svc: new PatientsService(prisma, progress), prisma };
}

describe('PatientsService.list', () => {
  const profiles = [prof('a', 'สมชาย'), prof('b', 'Somying', { baselineMocaScore: 20, dateOfBirth: null }), prof('c', 'มานี', { baselineMocaScore: null })];
  const progs = { a: prog('watch', day(0).toISOString()), b: prog('stable', day(1).toISOString()), c: prog('new', null) };

  it('maps summary fields; doctor scope uses assignedDoctorId', async () => {
    const { svc, prisma } = setup(profiles, progs);
    const r = await svc.list(doctor);
    expect(prisma.patientProfile.findMany.mock.calls[0][0].where).toEqual({ assignedDoctorId: 'd1' });
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ id: 'a', fullName: 'สมชาย', severity: 'ระยะเริ่มต้น', status: 'watch', sessionsToday: 2, avgScore: 20, sparkline: [1, 2, 3, 4, 5, 6, 7] });
    expect(r[0].age).toBeGreaterThanOrEqual(69);
    expect(r[0].current).toEqual([10, 20, 0, 0, 30, 0]);
    expect(r[0].baseline).toEqual([5, 15, -5, -5, 25, -5]);
    expect(r[1]).toMatchObject({ severity: 'ปานกลาง', age: null });
    expect(r[2]).toMatchObject({ severity: null, avgScore: null, status: 'new' });
  });
  it('caregiver scope via caregiver links; filters by status and q', async () => {
    const { svc, prisma } = setup(profiles, progs);
    expect((await svc.list(caregiver, 'watch')).map((s) => s.id)).toEqual(['a']);
    expect(prisma.patientProfile.findMany.mock.calls[0][0].where).toEqual({ caregivers: { some: { caregiverId: 'c1' } } });
    expect((await svc.list(caregiver, undefined, ' SOM ')).map((s) => s.id)).toEqual(['b']);
  });
});

describe('PatientsService.alerts', () => {
  it('empty when no patients', async () => {
    expect(await setup([], {}).svc.alerts(doctor)).toEqual({ alerts: [], activity: [] });
  });

  it('declining (critical), improving, inactive; sorted critical first; activity mapped', async () => {
    const profiles = [prof('a', 'A'), prof('b', 'B'), prof('c', 'C'), prof('d', 'D')];
    const snaps = [
      snap('a', 5, 45, true, 'declining', 1), snap('a', 5, 60, false, 'stable', 8), // delta -15 -> critical
      snap('b', 1, 70, false, 'improving', 1), snap('b', 1, 55, false, 'stable', 8), // +15 -> improving
      snap('c', 2, 50, true, 'stable', 1), // flagged, no prev, not critical (avg 50, delta 0)
    ];
    const progs = {
      a: prog('watch', day(0).toISOString()), b: prog('improving', day(0).toISOString()),
      c: prog('watch', day(5).toISOString()), d: prog('new', null),
    };
    const recent = [{
      patient: { user: { fullName: 'A' } }, game: { slug: 'spot' }, endedAt: day(0), startedAt: day(0), difficultyTier: 1, status: 'completed',
      scores: [{ domainId: 1, normalizedScore: 80 }, { domainId: 5, normalizedScore: 60 }],
    }];
    const { svc } = setup(profiles, progs, snaps, recent);
    const r = await svc.alerts(doctor, NOW);
    const byId = Object.fromEntries(r.alerts.map((a) => [a.id, a]));
    expect(byId['a:declining']).toMatchObject({ kind: 'declining', critical: true, text: 'คะแนนความจำลดลง 15%' });
    expect(byId['b:improving']).toMatchObject({ kind: 'improving', critical: false, text: 'คะแนนดีขึ้น 15% สัปดาห์นี้' });
    expect(byId['c:declining']).toMatchObject({ critical: false, text: 'คะแนนความเร็วคิดต่ำกว่าเกณฑ์' });
    expect(byId['c:inactive']).toMatchObject({ kind: 'inactive', text: 'ไม่ได้เล่นเกม 5 วัน' });
    expect(Object.keys(byId).some((k) => k.startsWith('d:'))).toBe(false);
    expect(r.alerts[0].id).toBe('a:declining');
    expect(r.activity).toEqual([{ patientName: 'A', gameId: 'spot', score: 70, at: day(0).toISOString() }]);
  });

  it('inactive threshold: 2 days no alert, 3 days alert', async () => {
    const mk = async (n: number) => (await setup([prof('a', 'A')], { a: prog('stable', day(n).toISOString()) }).svc.alerts(doctor, NOW)).alerts;
    expect(await mk(2)).toHaveLength(0);
    expect((await mk(3))[0].text).toBe('ไม่ได้เล่นเกม 3 วัน');
  });
});

describe('PatientsService.report', () => {
  const pr = { a: prog('stable', day(0).toISOString()) };
  it('defaults to last 7 days and returns progress + sessions', async () => {
    const { svc, prisma } = setup([prof('a', 'A')], pr);
    prisma.gameSession.findMany.mockResolvedValue([{
      id: 's', game: { slug: 'spot' }, difficultyTier: 1, status: 'completed', startedAt: day(0), endedAt: day(0), totalDurationMs: 1, scores: [],
    }]);
    const r = await svc.report('a', undefined, undefined, NOW);
    expect(r.from).toBe('2026-03-25T00:00:00.000Z');
    expect(r.to).toBe('2026-03-31T00:00:00.000Z');
    expect(r.sessions).toHaveLength(1);
    expect(r.patient.id).toBe('a');
    expect(r.progress.status).toBe('stable');
  });
  it('explicit range; 400 on bad/reversed dates; 404 unknown patient', async () => {
    const { svc } = setup([prof('a', 'A')], pr);
    expect((await svc.report('a', '2026-03-01', '2026-03-10', NOW)).from).toBe('2026-03-01T00:00:00.000Z');
    await expect(svc.report('a', 'garbage', undefined, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.report('a', '2026-03-10', '2026-03-01', NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup([], {}).svc.report('zz', undefined, undefined, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
