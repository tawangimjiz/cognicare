/* Idempotent seed: wipes user and session data, then inserts demo data (mirrors the HTML prototype). */
import { PrismaClient, TrendDirection } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { DOMAINS, GAMES } from '@cognicare/shared';

const prisma = new PrismaClient();
const DAYS = 49;
const WEEKS = 7;

type P = { name: string; age: number; status: 'watch' | 'improving' | 'stable'; baseline: number[]; current: number[]; severity: string };
// First 8 PATIENTS from the HTML prototype. Index 3 (คุณสมชาย) is patient@cognicare.test.
const PATIENTS: P[] = [
  { name: 'คุณสมหญิง', age: 78, status: 'watch', baseline: [60, 58, 55, 62, 65, 60], current: [55, 50, 40, 58, 60, 52], severity: 'ปานกลาง' },
  { name: 'คุณประเสริฐ', age: 74, status: 'watch', baseline: [58, 60, 52, 60, 62, 58], current: [50, 52, 45, 55, 58, 50], severity: 'ปานกลาง' },
  { name: 'คุณวิไล', age: 69, status: 'improving', baseline: [55, 52, 50, 58, 60, 55], current: [68, 70, 65, 72, 75, 70], severity: 'ระยะเริ่มต้น' },
  { name: 'คุณสมชาย', age: 71, status: 'improving', baseline: [55, 60, 50, 65, 58, 62], current: [68, 72, 45, 70, 80, 66], severity: 'ระยะเริ่มต้น' },
  { name: 'คุณมาลี', age: 80, status: 'stable', baseline: [58, 56, 55, 60, 60, 58], current: [60, 58, 56, 62, 62, 60], severity: 'ระยะเริ่มต้น' },
  { name: 'คุณสมพงษ์', age: 76, status: 'stable', baseline: [60, 58, 58, 62, 60, 60], current: [62, 60, 59, 63, 62, 61], severity: 'ระยะเริ่มต้น' },
  { name: 'คุณบุญมี', age: 83, status: 'watch', baseline: [56, 54, 52, 58, 55, 54], current: [45, 42, 38, 48, 44, 40], severity: 'ปานกลาง' },
  { name: 'คุณละออง', age: 72, status: 'improving', baseline: [50, 48, 46, 54, 52, 50], current: [64, 66, 60, 68, 70, 65], severity: 'ระยะเริ่มต้น' },
];

const now = new Date();
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const dateOnly = (daysAgo: number) => new Date(Date.UTC(Y, M, D - daysAgo));
const clamp = (v: number) => Math.max(5, Math.min(98, Math.round(v)));
// HTML generateSeries stretched from 30 to DAYS points. k = 0 is the oldest day.
const value = (p: P, d: number, k: number) => {
  const t = k / (DAYS - 1);
  return clamp(p.baseline[d] + (p.current[d] - p.baseline[d]) * t + 4 * Math.sin(t * 29 * 0.7 + d));
};

async function main() {
  // Domains, games, levels and metric definitions come from the reference_data migration.
  // Checked before the wipe so a DB that was never migrated keeps its data.
  const gameId: Record<string, string> = {};
  for (const g of await prisma.game.findMany()) gameId[g.slug] = g.id;
  if (GAMES.some((g) => !gameId[g.id])) throw new Error('games missing: run `npm run db:migrate` first');

  // wipe (children first)
  await prisma.sessionScore.deleteMany();
  await prisma.sessionEvent.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.cognitiveTrendSnapshot.deleteMany();
  await prisma.caregiverLink.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.user.deleteMany();

  const domId = (key: string) => DOMAINS.findIndex((d) => d.key === key) + 1;

  const hash = await bcrypt.hash('password123', 10);
  const doctor = await prisma.user.create({
    data: { role: 'doctor', fullName: 'นพ. ตัวอย่าง', email: 'doctor@cognicare.test', passwordHash: hash },
  });
  const caregiver = await prisma.user.create({
    data: { role: 'caregiver', fullName: 'ผู้ดูแลตัวอย่าง', email: 'caregiver@cognicare.test', passwordHash: hash },
  });

  const sessions: any[] = [];
  const scores: any[] = [];
  const snapshots: any[] = [];
  const addSession = (patientId: string, slug: string, start: Date, vals: Record<string, number>) => {
    const id = randomUUID();
    const dur = 5 * 60_000;
    sessions.push({ id, patientId, gameId: gameId[slug], difficultyTier: 1, startedAt: start, endedAt: new Date(start.getTime() + dur), totalDurationMs: dur, status: 'completed' });
    for (const [key, v] of Object.entries(vals)) {
      scores.push({ id: randomUUID(), sessionId: id, domainId: domId(key), gameId: gameId[slug], rawScore: v, normalizedScore: v, errorRate: +((100 - v) / 200).toFixed(2), meanReactionTimeMs: 900 + (100 - v) * 10 });
    }
  };

  for (let i = 0; i < PATIENTS.length; i++) {
    const p = PATIENTS[i];
    const email = i === 3 ? 'patient@cognicare.test' : `patient${i + 1}@cognicare.test`;
    const dob = new Date(Date.UTC(Y - p.age, M, D));
    const user = await prisma.user.create({
      data: {
        role: 'patient', fullName: p.name, email, passwordHash: hash,
        patientProfile: {
          create: {
            dateOfBirth: dob,
            mciDiagnosisDate: dateOnly(400),
            baselineMocaScore: p.severity === 'ระยะเริ่มต้น' ? 24 : 20,
            accessibilitySettings: { notif: true, sound: true, largeText: false },
            assignedDoctorId: doctor.id,
          },
        },
      },
    });
    if (i === 3) {
      await prisma.caregiverLink.create({ data: { caregiverId: caregiver.id, patientId: user.id, relationship: 'ลูกสาว' } });
    }

    // daily spot sessions: ago = days back from today, k = index from the oldest
    const daily: number[][] = []; // daily[ago][domain]
    for (let ago = 0; ago < DAYS; ago++) {
      const k = DAYS - 1 - ago;
      const vals = DOMAINS.map((_, d) => value(p, d, k));
      daily[ago] = vals;
      const start = ago === 0 ? new Date(now.getTime() - 40 * 60_000) : new Date(Y, M, D - ago, 10, 0);
      addSession(user.id, 'spot', start, Object.fromEntries(DOMAINS.map((d, di) => [d.key, vals[di]])));
    }
    // a few oneback sessions (focus + speed)
    for (const ago of [1, 3, 6]) {
      addSession(user.id, 'oneback', new Date(Y, M, D - ago, 15, 0), {
        focus: clamp(daily[ago][0] + 3), speed: clamp(daily[ago][1] - 2),
      });
    }
    // patient4: second session today -> goal 2/4
    if (i === 3) {
      addSession(user.id, 'oneback', new Date(now.getTime() - 15 * 60_000), { focus: 78, speed: 70 });
    }

    // weekly snapshots, w = 0 is the most recent window (today-6 .. today)
    for (let w = 0; w < WEEKS; w++) {
      const periodStart = dateOnly(6 + 7 * w);
      const periodEnd = dateOnly(7 * w);
      for (let d = 0; d < DOMAINS.length; d++) {
        const window = daily.slice(7 * w, 7 * w + 7).map((v) => v[d]);
        const declining = p.status === 'watch' && p.current[d] < p.baseline[d];
        const trend: TrendDirection = declining ? 'declining' : p.status === 'improving' ? 'improving' : 'stable';
        snapshots.push({
          patientId: user.id, domainId: d + 1, periodStart, periodEnd,
          avgNormalizedScore: +(window.reduce((a, b) => a + b, 0) / window.length).toFixed(2),
          sessionCount: 7, trendDirection: trend, flaggedForReview: declining,
        });
      }
    }
  }

  await prisma.gameSession.createMany({ data: sessions });
  await prisma.sessionScore.createMany({ data: scores });
  await prisma.cognitiveTrendSnapshot.createMany({ data: snapshots });
  console.log(`seeded: ${PATIENTS.length} patients, ${sessions.length} sessions, ${scores.length} scores, ${snapshots.length} snapshots`);
}

main().finally(() => prisma.$disconnect());
