import { Injectable } from '@nestjs/common';
import { DOMAINS, type DomainKey, type DomainProgress, type ProgressResponse } from '@cognicare/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { dayIndex, mean } from '../scoring/dates';
import { round2 } from '../scoring/scoring';
import { computeTrend } from '../scoring/trend';
import { patientStatus } from '../scoring/status';

const TTL = 300;
const cacheKey = (pid: string) => `cache:progress:${pid}`;

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async get(patientId: string): Promise<ProgressResponse> {
    const hit = await this.redis.client.get(cacheKey(patientId));
    if (hit) return JSON.parse(hit);
    const res = await this.compute(patientId);
    await this.redis.client.set(cacheKey(patientId), JSON.stringify(res), 'EX', TTL);
    return res;
  }

  async compute(patientId: string, now = new Date()): Promise<ProgressResponse> {
    const [sessions, snaps] = await Promise.all([
      this.prisma.gameSession.findMany({
        where: { patientId, status: 'completed' },
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true, totalDurationMs: true, scores: { select: { domainId: true, normalizedScore: true } } },
      }),
      this.prisma.cognitiveTrendSnapshot.findMany({ where: { patientId }, orderBy: { periodStart: 'desc' } }),
    ]);

    const today = dayIndex(now);
    // flat points: [dayIdx, domainId, score]
    const pts = sessions.flatMap((s) =>
      s.scores.map((x) => ({ day: dayIndex(s.startedAt), d: x.domainId, v: x.normalizedScore })));
    const avgIn = (from: number, to: number, d?: number) =>
      mean(pts.filter((p) => p.day >= from && p.day <= to && (d === undefined || p.d === d)).map((p) => p.v));
    const firstDay = pts.length ? Math.min(...pts.map((p) => p.day)) : today;

    const domains: DomainProgress[] = DOMAINS.map((def, i) => {
      const d = i + 1;
      const cur = avgIn(today - 6, today, d);
      const prev = avgIn(today - 13, today - 7, d);
      let last = avgIn(0, today - 30, d) ?? 0; // carry-forward seed
      const series: number[] = [];
      for (let k = today - 29; k <= today; k++) {
        last = avgIn(k, k, d) ?? last;
        series.push(round2(last));
      }
      const baseline = avgIn(firstDay, firstDay + 6, d) ?? 0;
      const current = cur ?? series[29];
      return {
        domain: def.key, current: round2(current), baseline: round2(baseline),
        changePct: baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : 0,
        series, trend: cur === null ? null : computeTrend(cur, prev).direction,
      };
    });

    const latest = new Map<number, (typeof snaps)[number]>();
    for (const s of snaps) if (!latest.has(s.domainId)) latest.set(s.domainId, s);

    const sparkline = [6, 5, 4, 3, 2, 1, 0].map((w) => {
      const to = today - w * 7;
      return round2(avgIn(to - 6, to) ?? 0);
    });

    const dayOf = (s: (typeof sessions)[number]) => dayIndex(s.startedAt);
    const todays = sessions.filter((s) => dayOf(s) === today);
    const yesterday = avgIn(today - 1, today - 1);
    const todayAvg = avgIn(today, today);
    const days = new Set(sessions.map(dayOf));
    let streakDays = 0;
    for (let k = days.has(today) ? today : today - 1; days.has(k); k--) streakDays++;

    const withData = domains.filter((d) => d.current > 0);
    const rank = [...withData].sort((a, b) => b.current - a.current);
    const last = sessions[sessions.length - 1];

    return {
      patientId, status: patientStatus([...latest.values()]), domains, sparkline,
      today: {
        score: round2(todayAvg ?? 0),
        scoreChangePct: todayAvg !== null && yesterday ? Math.round(((todayAvg - yesterday) / yesterday) * 100) : null,
        minutes: Math.round(todays.reduce((a, s) => a + (s.totalDurationMs ?? 0), 0) / 60000),
        games: todays.length,
      },
      streakDays, totalSessions: sessions.length,
      best: (rank[0]?.domain as DomainKey) ?? null,
      weakest: (rank.length > 1 ? rank[rank.length - 1].domain : null) as DomainKey | null,
      lastSessionAt: last ? last.startedAt.toISOString() : null,
    };
  }
}
