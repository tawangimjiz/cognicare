import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionsService, toSessionDto } from './sessions.service';

const P = 'p1';
function setup(over: any = {}) {
  const tx: any = {
    gameSession: { update: jest.fn() },
    sessionEvent: { createMany: jest.fn() },
    sessionScore: { createMany: jest.fn() },
  };
  const prisma: any = {
    game: { findUnique: jest.fn().mockResolvedValue({ id: 'g1', slug: 'spot' }) },
    gameLevel: { findUnique: jest.fn().mockResolvedValue({ id: 'l1' }) },
    gameSession: {
      create: jest.fn().mockResolvedValue({ id: 's1', startedAt: new Date('2026-01-01T00:00:00Z') }),
      findUnique: jest.fn().mockResolvedValue({ id: 's1', patientId: P, gameId: 'g1', status: 'in_progress' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 's1', game: { slug: 'spot' }, difficultyTier: 1, status: 'completed',
        startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-01T00:01:00Z'), totalDurationMs: 60000,
        scores: [{ domainId: 5, rawScore: 80, normalizedScore: 80, errorRate: 0.1, meanReactionTimeMs: null },
          { domainId: 1, rawScore: 60, normalizedScore: 60, errorRate: null, meanReactionTimeMs: 400 }],
      }),
      findMany: jest.fn(),
    },
    metricDefinition: { findMany: jest.fn().mockResolvedValue([{ domainId: 5, maxRawScore: 100 }, { domainId: 1, maxRawScore: 100 }]) },
    sessionScore: { findMany: jest.fn().mockResolvedValue([]) },
    cognitiveTrendSnapshot: { upsert: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
    ...over,
  };
  const redis: any = { client: { del: jest.fn(), zadd: jest.fn() } };
  return { svc: new SessionsService(prisma, redis), prisma, redis, tx };
}
const body = (extra: any = {}) => ({
  status: 'completed', totalDurationMs: 60000,
  scores: [{ domain: 'memory', rawScore: 80, errorRate: 0.1 }, { domain: 'focus', rawScore: 60 }], ...extra,
});

describe('SessionsService.start', () => {
  it('creates a session', async () => {
    const { svc, prisma } = setup();
    expect(await svc.start(P, { gameId: 'spot', tier: 2 })).toEqual({ sessionId: 's1', startedAt: '2026-01-01T00:00:00.000Z' });
    expect(prisma.gameSession.create).toHaveBeenCalledWith({ data: { patientId: P, gameId: 'g1', levelId: 'l1', difficultyTier: 2 } });
  });
  it('400 on unknown game / tier', async () => {
    const a = setup({ game: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(a.svc.start(P, { gameId: 'x', tier: 1 })).rejects.toBeInstanceOf(BadRequestException);
    const b = setup({ gameLevel: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(b.svc.start(P, { gameId: 'spot', tier: 3 })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts tier 5', async () => {
    const { svc, prisma } = setup();
    await svc.start(P, { gameId: 'oneback', tier: 5 });
    expect(prisma.gameSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ difficultyTier: 5 }) });
  });
});

describe('SessionsService.end', () => {
  it('stores metrics', async () => {
    const { svc, tx } = setup();
    await svc.end(P, 's1', body({ metrics: { dPrime: 1.5 } }) as any);
    expect(tx.gameSession.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: expect.objectContaining({ metrics: { dPrime: 1.5 } }) });
  });
  it('400 on oversized / too deep / array metrics', async () => {
    for (const metrics of [{ big: 'x'.repeat(33 * 1024) }, { a: { b: { c: { d: { e: 1 } } } } }, [1], { a: Infinity }]) {
      const { svc, tx } = setup();
      await expect(svc.end(P, 's1', body({ metrics }) as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.gameSession.update).not.toHaveBeenCalled();
    }
  });
  it('404 / 403 / 409', async () => {
    const find = (v: any) => setup({ gameSession: { findUnique: jest.fn().mockResolvedValue(v) } }).svc;
    await expect(find(null).end(P, 's1', body() as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(find({ patientId: 'other', status: 'in_progress' }).end(P, 's1', body() as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(find({ patientId: P, status: 'completed' }).end(P, 's1', body() as any)).rejects.toBeInstanceOf(ConflictException);
  });
  it('400 on unknown/duplicate domain or missing metric', async () => {
    const { svc } = setup();
    await expect(svc.end(P, 's1', body({ scores: [{ domain: 'nope', rawScore: 1 }] }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.end(P, 's1', body({ scores: [{ domain: 'focus', rawScore: 1 }, { domain: 'focus', rawScore: 2 }] }))).rejects.toBeInstanceOf(BadRequestException);
    const m = setup({ metricDefinition: { findMany: jest.fn().mockResolvedValue([{ domainId: 5, maxRawScore: 100 }]) } });
    await expect(m.svc.end(P, 's1', body() as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('stores normalized scores + events, drops cache, bumps leaderboard, upserts snapshots', async () => {
    const { svc, tx, redis, prisma } = setup({
      metricDefinition: { findMany: jest.fn().mockResolvedValue([{ domainId: 5, maxRawScore: 200 }, { domainId: 1, maxRawScore: 100 }]) },
      sessionScore: {
        findMany: jest.fn().mockResolvedValue([
          { domainId: 5, normalizedScore: 30, session: { startedAt: new Date() } },
          { domainId: 5, normalizedScore: 80, session: { startedAt: new Date(Date.now() - 10 * 86400000) } },
        ]),
      },
    });
    const dto = await svc.end(P, 's1', body({ events: [{ type: 'click', at: '2026-01-01T00:00:01Z', reactionTimeMs: 300 }, { type: 'hit', at: '2026-01-01T00:00:02Z', data: { a: 1 } }] }) as any);
    const scores = tx.sessionScore.createMany.mock.calls[0][0].data;
    expect(scores.map((s: any) => [s.domainId, s.normalizedScore])).toEqual([[5, 40], [1, 60]]);
    expect(tx.sessionEvent.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(redis.client.del).toHaveBeenCalledWith(`cache:progress:${P}`);
    expect(redis.client.zadd).toHaveBeenCalledWith('lb:spot', 'GT', 70, P);
    expect(prisma.cognitiveTrendSnapshot.upsert).toHaveBeenCalledTimes(2);
    const memory = prisma.cognitiveTrendSnapshot.upsert.mock.calls[0][0].create;
    expect(memory).toMatchObject({ domainId: 5, avgNormalizedScore: 30, trendDirection: 'declining', flaggedForReview: true });
    expect(dto).toMatchObject({ id: 's1', gameId: 'spot', score: 70 });
  });
  it('non-completed status: no snapshots, no leaderboard, no events insert when none', async () => {
    const { svc, tx, redis, prisma } = setup();
    await svc.end(P, 's1', body({ status: 'abandoned' }) as any);
    expect(prisma.cognitiveTrendSnapshot.upsert).not.toHaveBeenCalled();
    expect(redis.client.zadd).not.toHaveBeenCalled();
    expect(tx.sessionEvent.createMany).not.toHaveBeenCalled();
    expect(redis.client.del).toHaveBeenCalled();
  });
});

describe('SessionsService.results', () => {
  it('queries completed+ended newest first and clamps limit', async () => {
    const { svc, prisma } = setup();
    prisma.gameSession.findMany.mockResolvedValue([]);
    await svc.results(P, 1000);
    expect(prisma.gameSession.findMany.mock.calls[0][0]).toMatchObject({
      where: { patientId: P, status: 'completed', endedAt: { not: null } }, orderBy: { endedAt: 'desc' }, take: 100,
    });
    await svc.results(P, NaN);
    expect(prisma.gameSession.findMany.mock.calls[1][0].take).toBe(20);
  });
});

describe('toSessionDto', () => {
  it('score is 0 with no scores and nulls pass through', () => {
    const d = toSessionDto({ id: 'a', game: { slug: 'maze' }, difficultyTier: 1, status: 'completed', startedAt: new Date(0), endedAt: null, scores: [] });
    expect(d).toMatchObject({ score: 0, endedAt: null, totalDurationMs: null });
  });
});
