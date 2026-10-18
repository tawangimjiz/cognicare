import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DOMAINS, type GameSlug, type SessionDto, type StartSessionResponse } from '@cognicare/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { addDays, mean, startOfDay } from '../scoring/dates';
import { normalize, round2 } from '../scoring/scoring';
import { computeTrend } from '../scoring/trend';
import type { EndSessionDto, StartSessionDto } from './dto/session.dto';

const domainKey = (id: number) => DOMAINS[id - 1].key;
const domainId = (key: string) => DOMAINS.findIndex((d) => d.key === key) + 1;

export const sessionInclude = { game: { select: { slug: true } }, scores: true } as const;

export function toSessionDto(s: any): SessionDto {
  const scores = (s.scores as any[]).map((x) => ({
    domain: domainKey(x.domainId), rawScore: x.rawScore, normalizedScore: x.normalizedScore,
    errorRate: x.errorRate ?? null, meanReactionTimeMs: x.meanReactionTimeMs ?? null,
  }));
  return {
    id: s.id, gameId: s.game.slug as GameSlug, tier: s.difficultyTier, status: s.status,
    startedAt: s.startedAt.toISOString(), endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    totalDurationMs: s.totalDurationMs ?? null,
    score: round2(mean(scores.map((x) => x.normalizedScore)) ?? 0), scores,
  };
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async start(patientId: string, body: StartSessionDto): Promise<StartSessionResponse> {
    const game = await this.prisma.game.findUnique({ where: { slug: body.gameId } });
    if (!game) throw new BadRequestException('unknown game');
    const level = await this.prisma.gameLevel.findUnique({ where: { gameId_tier: { gameId: game.id, tier: body.tier } } });
    if (!level) throw new BadRequestException('unknown tier');
    const s = await this.prisma.gameSession.create({
      data: { patientId, gameId: game.id, levelId: level.id, difficultyTier: body.tier },
    });
    return { sessionId: s.id, startedAt: s.startedAt.toISOString() };
  }

  async end(patientId: string, sessionId: string, body: EndSessionDto): Promise<SessionDto> {
    const session = await this.prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('session not found');
    if (session.patientId !== patientId) throw new ForbiddenException();
    if (session.status !== 'in_progress') throw new ConflictException('session already ended');

    const ids = body.scores.map((s) => domainId(s.domain));
    if (ids.some((i) => i < 1) || new Set(ids).size !== ids.length) throw new BadRequestException('invalid or duplicate domain');
    const metrics = await this.prisma.metricDefinition.findMany({ where: { gameId: session.gameId, domainId: { in: ids } } });
    const maxByDomain = new Map(metrics.map((m) => [m.domainId, m.maxRawScore]));
    if (ids.some((i) => !maxByDomain.has(i))) throw new BadRequestException('no metric definition for game/domain');

    const endedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.gameSession.update({
        where: { id: sessionId },
        data: { endedAt, totalDurationMs: body.totalDurationMs, status: body.status as any },
      });
      if (body.events?.length) {
        await tx.sessionEvent.createMany({
          data: body.events.map((e) => ({
            sessionId, type: e.type, occurredAt: new Date(e.at), reactionTimeMs: e.reactionTimeMs ?? null,
            payload: (e.data ?? {}) as any,
          })),
        });
      }
      await tx.sessionScore.createMany({
        data: body.scores.map((s, i) => ({
          sessionId, gameId: session.gameId, domainId: ids[i], rawScore: s.rawScore,
          normalizedScore: normalize(s.rawScore, maxByDomain.get(ids[i])!),
          errorRate: s.errorRate ?? null, meanReactionTimeMs: s.meanReactionTimeMs ?? null,
        })),
      });
    });

    if (body.status === 'completed') await this.updateSnapshots(patientId, ids);
    await this.redis.client.del(`cache:progress:${patientId}`);

    const full = await this.prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
    const dto = toSessionDto(full);
    if (body.status === 'completed') await this.redis.client.zadd(`lb:${dto.gameId}`, 'GT', dto.score, patientId);
    return dto;
  }

  async results(patientId: string, limit = 20): Promise<{ items: SessionDto[] }> {
    const take = Math.min(100, Math.max(1, Math.trunc(limit) || 20));
    const rows = await this.prisma.gameSession.findMany({
      where: { patientId, status: 'completed', endedAt: { not: null } },
      orderBy: { endedAt: 'desc' }, take, include: sessionInclude,
    });
    return { items: rows.map(toSessionDto) };
  }

  /** Rolling 7-day snapshot (today-6..today) vs previous 7 days, upserted per scored domain. */
  private async updateSnapshots(patientId: string, ids: number[], now = new Date()) {
    const today = startOfDay(now);
    const curStart = addDays(today, -6);
    const prevStart = addDays(today, -13);
    const rows = await this.prisma.sessionScore.findMany({
      where: { domainId: { in: ids }, session: { patientId, status: 'completed', startedAt: { gte: prevStart } } },
      select: { domainId: true, normalizedScore: true, session: { select: { startedAt: true } } },
    });
    for (const id of ids) {
      const mine = rows.filter((r) => r.domainId === id);
      const cur = mine.filter((r) => r.session.startedAt >= curStart);
      const prev = mine.filter((r) => r.session.startedAt < curStart);
      const curAvg = mean(cur.map((r) => r.normalizedScore)) ?? 0;
      const { direction, flagged } = computeTrend(curAvg, mean(prev.map((r) => r.normalizedScore)));
      const data = {
        periodEnd: today, avgNormalizedScore: round2(curAvg), sessionCount: cur.length,
        trendDirection: direction, flaggedForReview: flagged,
      };
      await this.prisma.cognitiveTrendSnapshot.upsert({
        where: { patientId_domainId_periodStart: { patientId, domainId: id, periodStart: curStart } },
        create: { patientId, domainId: id, periodStart: curStart, ...data },
        update: data,
      });
    }
  }
}
