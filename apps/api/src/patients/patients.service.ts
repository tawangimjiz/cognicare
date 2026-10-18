import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DOMAINS, type ActivityDto, type AlertDto, type AlertsResponse, type GameSlug, type PatientStatus,
  type PatientSummary, type ReportResponse,
} from '@cognicare/shared';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { DAY, addDays, dayIndex, mean, startOfDay } from '../scoring/dates';
import { round2 } from '../scoring/scoring';
import { sessionInclude, toSessionDto } from '../sessions/sessions.service';

const profileInclude = { user: { select: { fullName: true } } } as const;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService, private readonly progress: ProgressService) {}

  private profilesFor(user: AuthUser) {
    const where = user.role === 'doctor'
      ? { assignedDoctorId: user.id }
      : { caregivers: { some: { caregiverId: user.id } } };
    return this.prisma.patientProfile.findMany({ where, include: profileInclude, orderBy: { user: { fullName: 'asc' } } });
  }

  private async summary(p: any, now = new Date()): Promise<PatientSummary> {
    const pr = await this.progress.get(p.patientId);
    const hasData = pr.totalSessions > 0;
    const avg = mean(pr.domains.filter((d) => d.current > 0).map((d) => d.current));
    const age = p.dateOfBirth ? Math.floor((now.getTime() - new Date(p.dateOfBirth).getTime()) / (365.25 * DAY)) : null;
    return {
      id: p.patientId, fullName: p.user.fullName, age,
      severity: p.baselineMocaScore == null ? null : p.baselineMocaScore >= 22 ? 'ระยะเริ่มต้น' : 'ปานกลาง',
      status: pr.status, lastSessionAt: pr.lastSessionAt, sessionsToday: pr.today.games,
      avgScore: hasData && avg !== null ? round2(avg) : null, sparkline: pr.sparkline,
      baseline: pr.domains.map((d) => d.baseline), current: pr.domains.map((d) => d.current),
    };
  }

  async list(user: AuthUser, status?: PatientStatus, q?: string): Promise<PatientSummary[]> {
    const all = await Promise.all((await this.profilesFor(user)).map((p) => this.summary(p)));
    const needle = q?.trim().toLowerCase();
    return all.filter((s) => (!status || s.status === status) && (!needle || s.fullName.toLowerCase().includes(needle)));
  }

  async alerts(user: AuthUser, now = new Date()): Promise<AlertsResponse> {
    const profiles = await this.profilesFor(user);
    const ids = profiles.map((p) => p.patientId);
    if (!ids.length) return { alerts: [], activity: [] };
    const [snaps, recent] = await Promise.all([
      this.prisma.cognitiveTrendSnapshot.findMany({ where: { patientId: { in: ids } }, orderBy: { periodStart: 'desc' } }),
      this.prisma.gameSession.findMany({
        where: { patientId: { in: ids }, status: 'completed' }, orderBy: { endedAt: 'desc' }, take: 10,
        include: { ...sessionInclude, patient: { select: { user: { select: { fullName: true } } } } },
      }),
    ]);

    const alerts: AlertDto[] = [];
    for (const p of profiles) {
      const name = p.user.fullName;
      const mine = snaps.filter((s) => s.patientId === p.patientId);
      // snaps are newest-first; per domain: [latest, previous]
      const hist = DOMAINS.map((_, i) => mine.filter((s) => s.domainId === i + 1));
      const flagged = hist.map((h, i) => ({ h, i })).filter((x) => x.h[0]?.flaggedForReview);
      const delta = (h: typeof mine) => (h[1] ? h[0].avgNormalizedScore - h[1].avgNormalizedScore : 0);
      if (flagged.length) {
        const critical = flagged.some((x) => x.h[0].avgNormalizedScore < 40 || delta(x.h) <= -10);
        const worst = flagged.reduce((a, b) => (delta(b.h) < delta(a.h) ? b : a));
        const drop = Math.round(-delta(worst.h));
        alerts.push({
          id: `${p.patientId}:declining`, patientId: p.patientId, patientName: name, kind: 'declining', critical,
          text: drop > 0 ? `คะแนน${DOMAINS[worst.i].th}ลดลง ${drop}%` : `คะแนน${DOMAINS[worst.i].th}ต่ำกว่าเกณฑ์`,
          at: worst.h[0].createdAt.toISOString(),
        });
      }
      const up = hist.filter((h) => h[0] && delta(h) >= 10).sort((a, b) => delta(b) - delta(a))[0];
      if (up) {
        alerts.push({
          id: `${p.patientId}:improving`, patientId: p.patientId, patientName: name, kind: 'improving', critical: false,
          text: `คะแนนดีขึ้น ${Math.round(delta(up))}% สัปดาห์นี้`, at: up[0].createdAt.toISOString(),
        });
      }
      const last = (await this.progress.get(p.patientId)).lastSessionAt;
      if (last) {
        const days = Math.floor((startOfDay(now).getTime() - startOfDay(new Date(last)).getTime()) / DAY);
        if (days >= 3) {
          alerts.push({
            id: `${p.patientId}:inactive`, patientId: p.patientId, patientName: name, kind: 'inactive', critical: false,
            text: `ไม่ได้เล่นเกม ${days} วัน`, at: last,
          });
        }
      }
    }
    alerts.sort((a, b) => Number(b.critical) - Number(a.critical) || b.at.localeCompare(a.at));

    const activity: ActivityDto[] = recent.map((s: any) => ({
      patientName: s.patient.user.fullName, gameId: s.game.slug as GameSlug, score: toSessionDto(s).score,
      at: (s.endedAt ?? s.startedAt).toISOString(),
    }));
    return { alerts, activity };
  }

  async report(patientId: string, from?: string, to?: string, now = new Date()): Promise<ReportResponse> {
    const parse = (v: string | undefined, def: Date) => {
      if (!v) return def;
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new BadRequestException('invalid date');
      return startOfDay(d);
    };
    const end = parse(to, startOfDay(now));
    const start = parse(from, addDays(end, -6));
    if (start > end) throw new BadRequestException('from must be <= to');

    const profile = await this.prisma.patientProfile.findUnique({ where: { patientId }, include: profileInclude });
    if (!profile) throw new NotFoundException('patient not found');
    const rows = await this.prisma.gameSession.findMany({
      where: { patientId, status: 'completed', startedAt: { gte: start, lt: addDays(end, 1) } },
      orderBy: { startedAt: 'desc' }, include: sessionInclude,
    });
    // from/to are calendar dates (Bangkok day) labelled at UTC midnight
    const label = (d: Date) => new Date(dayIndex(d) * DAY).toISOString();
    return {
      patient: await this.summary(profile, now), from: label(start), to: label(end),
      progress: await this.progress.get(patientId), sessions: rows.map(toSessionDto),
    };
  }
}
