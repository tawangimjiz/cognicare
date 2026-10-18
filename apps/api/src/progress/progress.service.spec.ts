import { ProgressService } from './progress.service';

const NOW = new Date('2026-03-31T12:00:00Z');
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400000);
const sess = (daysAgo: number, scores: [number, number][], ms = 120000) => ({
  startedAt: at(daysAgo), totalDurationMs: ms, scores: scores.map(([domainId, normalizedScore]) => ({ domainId, normalizedScore })),
});

function setup(sessions: any[], snaps: any[] = [], cached: string | null = null) {
  const prisma: any = {
    gameSession: { findMany: jest.fn().mockResolvedValue(sessions) },
    cognitiveTrendSnapshot: { findMany: jest.fn().mockResolvedValue(snaps) },
  };
  const redis: any = { client: { get: jest.fn().mockResolvedValue(cached), set: jest.fn() } };
  return { svc: new ProgressService(prisma, redis), prisma, redis };
}

describe('ProgressService.compute', () => {
  it('new patient: empty aggregates', async () => {
    const { svc } = setup([]);
    const r = await svc.compute('p', NOW);
    expect(r).toMatchObject({ status: 'new', totalSessions: 0, streakDays: 0, best: null, weakest: null, lastSessionAt: null });
    expect(r.domains).toHaveLength(6);
    expect(r.domains[0].series).toHaveLength(30);
    expect(r.sparkline).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.today).toEqual({ score: 0, scoreChangePct: null, minutes: 0, games: 0 });
    expect(r.domains[0].trend).toBeNull();
  });

  it('aggregates fixtures', async () => {
    const { svc } = setup(
      [
        sess(40, [[5, 50], [1, 40]]), // baseline window (first 7d of history)
        sess(10, [[5, 60]]), // previous window
        sess(1, [[5, 80], [1, 60]]), // yesterday
        sess(0, [[5, 90], [1, 70]]), // today
        sess(0, [[5, 70]], 180000),
      ],
      [
        { domainId: 5, trendDirection: 'improving', flaggedForReview: false },
        { domainId: 5, trendDirection: 'declining', flaggedForReview: true }, // older, ignored
      ],
    );
    const r = await svc.compute('p', NOW);
    const memory = r.domains[4];
    expect(memory).toMatchObject({ domain: 'memory', baseline: 50, current: 80, changePct: 60, trend: 'improving' });
    expect(memory.series[29]).toBe(80);
    expect(memory.series[28]).toBe(80);
    expect(memory.series[0]).toBe(50); // carried from earlier history
    expect(r.domains[0]).toMatchObject({ domain: 'focus', baseline: 40, current: 65, trend: 'stable' });
    expect(r.domains[1]).toMatchObject({ current: 0, baseline: 0, changePct: 0, trend: null });
    expect(r.status).toBe('improving');
    expect(r.totalSessions).toBe(5);
    expect(r.streakDays).toBe(2);
    expect(r.today).toMatchObject({ games: 2, minutes: 5 });
    expect(r.today.score).toBe(76.67);
    expect(r.today.scoreChangePct).toBe(10);
    expect(r.best).toBe('memory');
    expect(r.weakest).toBe('focus');
    expect(r.sparkline).toHaveLength(7);
    expect(r.sparkline[6]).toBe(74);
    expect(r.lastSessionAt).toBe(at(0).toISOString());
  });

  it('streak counts from yesterday when nothing today; broken by gap', async () => {
    const a = await setup([sess(1, [[1, 50]]), sess(2, [[1, 50]]), sess(4, [[1, 50]])]).svc.compute('p', NOW);
    expect(a.streakDays).toBe(2);
    expect(a.today.scoreChangePct).toBeNull();
  });

  it('watch when any latest snapshot flagged; stable otherwise; weakest null with a single domain', async () => {
    const w = await setup([sess(0, [[1, 30]])], [{ domainId: 1, trendDirection: 'stable', flaggedForReview: true }]).svc.compute('p', NOW);
    expect(w.status).toBe('watch');
    expect(w.weakest).toBeNull();
    expect(w.best).toBe('focus');
    const s = await setup([sess(0, [[1, 50]])], [{ domainId: 1, trendDirection: 'stable', flaggedForReview: false }]).svc.compute('p', NOW);
    expect(s.status).toBe('stable');
  });

  it('decline: current falls >=5 vs previous window', async () => {
    const r = await setup([sess(10, [[2, 80]]), sess(1, [[2, 60]])]).svc.compute('p', NOW);
    expect(r.domains[1].trend).toBe('declining');
  });
});

describe('ProgressService.get (cache)', () => {
  it('cache hit skips Prisma', async () => {
    const { svc, prisma, redis } = setup([], [], JSON.stringify({ patientId: 'p', cached: true }));
    expect(await svc.get('p')).toEqual({ patientId: 'p', cached: true });
    expect(prisma.gameSession.findMany).not.toHaveBeenCalled();
    expect(redis.client.get).toHaveBeenCalledWith('cache:progress:p');
  });
  it('cache miss computes and stores with 300s TTL', async () => {
    const { svc, redis } = setup([]);
    const r = await svc.get('p');
    expect(r.status).toBe('new');
    expect(redis.client.set).toHaveBeenCalledWith('cache:progress:p', expect.any(String), 'EX', 300);
  });
});
