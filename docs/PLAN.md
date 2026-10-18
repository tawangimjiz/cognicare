# CogniCare: Implementation Plan

Web platform for MCI cognitive training. Sources: `D:\Claude\platform\CogniCare Platform.html` (UI source of truth, function names below refer to it) and the project report, ch.3 (3.3 architecture, 3.6 DB, 3.7 API, 3.9 tests).

## 0. Decisions

| Topic | Decision |
|---|---|
| Repo | npm workspaces monorepo: `packages/shared`, `apps/api`, `apps/web`. Node 24, npm 11. |
| API | NestJS 11 + **Prisma 6** (`prisma@^6`, `@prisma/client@^6`; do NOT use 7). Why Prisma: one schema file mirrors report 3.6 one-to-one, gives a typed client, and has built-in migrate and seed, with less boilerplate than TypeORM entities. |
| DB / cache | PostgreSQL 16 + Redis 7 via `docker-compose.yml`. Redis covers: JWT session allowlist, progress cache, leaderboard ZSET. |
| Auth | JWT HS256 (`@nestjs/jwt`, no passport). Payload `{sub, role, jti}`, expiry 8h. Redis `sess:<jti>` allowlist, so logout revokes the token. Passwords use `bcryptjs` (no native build on Windows). Login/register throttled with `@nestjs/throttler` (5/min/IP). |
| Roles | `patient`, `caregiver`, `doctor`. Public register accepts only `patient` or `caregiver`. Doctors come from the seed. Caregivers use the doctor UI, read-only, scoped to linked patients. |
| Web | Next.js `^15.5` App Router + React 19 + TS. No UI library. The HTML `<style>` block is copied verbatim into `globals.css` and class names are kept, so the port stays faithful. Pages are client components (the token lives in `localStorage`; `ponytail:` XSS-exposed, move to httpOnly cookie via a Next route handler before production). |
| Shared | `@cognicare/shared` is compiled with `tsc` to CJS `dist/` and used by both apps (DTO types, DOMAINS/GAMES constants, game-bridge contract). Root `postinstall` builds it and runs `prisma generate`. |
| Games | Unity WebGL builds go in `apps/web/public/games/<id>/index.html` later. `GameEmbed` detects the build with a HEAD request, otherwise shows the coming-soon state. **Spot demo is kept**: it is about 4 KB in the HTML (`sceneSvg`, `renderGamePlay`, `DIFF_SPOTS`). It is ported as `SpotDemo` and serves as the fallback for `spot`, and it reports through the real POST/PUT `/sessions`, so the API runs end to end before Unity exists. |
| Ports | web 3000, api 4000 (global prefix `/api`), pg 5432, redis 6379. |
| Numeric | Report NUMERIC columns are mapped to Prisma `Float` (double precision) to avoid Decimal JSON serialization. |

## 1. Directory layout (owner WP in brackets)

```
cognicare/
  package.json                     [WP1] workspaces ["packages/*","apps/*"]; scripts below
  package-lock.json  .gitignore    [WP1]
  docker-compose.yml               [WP1]
  docs/PLAN.md                     [planner]
  docs/GAME_BRIDGE.md              [WP7] contract for the Unity team
  docs/unity/CogniCareBridge.jslib [WP7] Unity -> window.parent.postMessage helper
  docs/cognicare.postman_collection.json [WP3]
  packages/shared/
    package.json tsconfig.json     [WP1]
    src/index.ts                   [WP1] re-exports
    src/domain.ts                  [WP1] DOMAINS, GAMES, STATUS_META, DAILY_GOAL=4 (verbatim from HTML)
    src/api-types.ts               [WP1] §4 types, verbatim
    src/game-bridge.ts             [WP1 types verbatim from §6] -> [WP7] adds parseGameMessage()
    test/game-bridge.test.mjs      [WP7] node --test against dist
  apps/api/
    package.json (ALL api deps) tsconfig.json tsconfig.build.json nest-cli.json .env.example  [WP1]
    prisma/schema.prisma           [WP1] verbatim §3
    prisma/migrations/**           [WP2] `prisma migrate dev --name init`
    prisma/seed.ts                 [WP2]
    src/main.ts app.module.ts      [WP1] (app.module imports every module below; WP1 writes empty @Module({}) stubs)
    src/prisma/prisma.{module,service}.ts   [WP1] @Global
    src/redis/redis.{module,service}.ts     [WP1] @Global, ioredis, exposes `client`
    src/auth/auth.types.ts         [WP1] `export interface AuthUser { id: string; role: Role; jti: string }`
    src/health/health.controller.ts [WP1] GET /api/health (pg `SELECT 1` + redis PING)
    src/auth/**  (except auth.types.ts) [WP2] module, controller, service, jwt-auth.guard, roles.guard, roles.decorator, current-user.decorator, dto/*, *.spec.ts
    src/users/**                   [WP2] users.{module,controller,service}, access.service.ts, *.spec.ts
    src/games/**                   [WP2] GET /games
    src/scoring/{scoring,trend,status}.ts + specs [WP3] pure functions
    src/sessions/**                [WP3]
    src/progress/**                [WP3] /results, /progress, /report
    src/patients/**                [WP3] /patients, /alerts
    src/leaderboard/**             [WP3]
    test/jest-e2e.json             [WP1]
    test/auth.e2e-spec.ts          [WP2]
    test/sessions.e2e-spec.ts      [WP3]
  apps/web/
    package.json tsconfig.json next.config.mjs (transpilePackages not needed; shared is CJS) .env.example  [WP1]
    app/layout.tsx app/globals.css [WP4]
    app/page.tsx                   [WP4] landing
    app/login/page.tsx             [WP4]
    app/patient/layout.tsx         [WP4] AppShell role=patient
    app/doctor/layout.tsx          [WP4] AppShell role=doctor|caregiver
    app/patient/settings/page.tsx app/doctor/settings/page.tsx [WP4] render <Settings/>
    components/Icon.tsx            [WP4] port of icon()
    components/AppShell.tsx        [WP4] renderTopbar + renderTabbar (navDefs from computeVM)
    components/charts.tsx          [WP4] <Sparkline points/> <Radar baseline current/> (port polar/polygonPoints/buildRadar/radarSvg/sparklinePointsFrom)
    components/Settings.tsx        [WP4] renderSettings + PATCH /users/me/settings, applies --font-scale
    lib/api.ts                     [WP4] typed fetch client, one function per endpoint in §5, ApiError
    lib/auth.tsx                   [WP4] AuthProvider/useAuth (login, logout, user, token in localStorage)
    lib/format.ts                  [WP4] formatDate (Buddhist year, Thai months), relative time
    app/patient/page.tsx                [WP5] renderPatientHome
    app/patient/games/page.tsx          [WP5] renderGameHub
    app/patient/games/[id]/page.tsx     [WP5] GameEmbed or SpotDemo fallback
    app/patient/rewards/page.tsx        [WP5] renderRewards
    components/patient/SpotDemo.tsx     [WP5]
    lib/rewards.ts                      [WP5] badges (verbatim) + unlock rules
    app/doctor/page.tsx                 [WP6] renderDoctorHome
    app/doctor/alerts/page.tsx          [WP6] renderDoctorAlerts
    app/doctor/report/page.tsx          [WP6] redirect to first patient
    app/doctor/report/[patientId]/page.tsx [WP6] renderReport
    components/doctor/{PatientList,AlertCards,ReportView}.tsx [WP6]
    components/GameEmbed.tsx            [WP7]
    components/ComingSoon.tsx           [WP7] renderComingSoon
    public/games/mock/index.html        [WP7] fake game that speaks the bridge (dev testing)
```

Root scripts (WP1): `postinstall` = `npm run build -w @cognicare/shared && npm run prisma:generate -w apps/api`; `dev:api`, `dev:web`, `build` (`npm run build --workspaces --if-present`), `typecheck` (`--workspaces --if-present`), `test` (`-w apps/api`), `test:e2e` (`-w apps/api`), `db:migrate`, `db:seed`.
API scripts: `start:dev`, `build`, `typecheck` (tsc --noEmit), `test` (jest --coverage), `test:e2e`, `prisma:generate`, `db:migrate` (prisma migrate deploy), `db:seed` (prisma db seed, `"prisma":{"seed":"ts-node prisma/seed.ts"}`).
Web scripts: `dev`, `build`, `start`, `typecheck` (tsc --noEmit).
Env: `apps/api/.env`: `DATABASE_URL=postgresql://cognicare:cognicare@localhost:5432/cognicare`, `REDIS_URL=redis://localhost:6379`, `JWT_SECRET=change-me`, `JWT_EXPIRES_IN=8h`, `WEB_ORIGIN=http://localhost:3000`, `PORT=4000`. `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

## 2. Domain constants (packages/shared/src/domain.ts, verbatim from HTML)

`DOMAINS` (order matters; DB `domain_id` = index+1): focus สมาธิ #1A56DB target · speed ความเร็วคิด #0E7490 bolt · direction ทิศทาง #B45309 compass · language ภาษา #7C3AED message · memory ความจำ #0F766E brain · mood อารมณ์ #BE185D smile.
`GAMES`: spot จับผิดภาพ → memory · oneback One Back Task → focus · maze เขาวงกต 3D → direction. Copy `ready`/`ai` flags. `STATUS_META` is copied verbatim (watch/improving/stable/new).

## 3. DB schema (apps/api/prisma/schema.prisma, 11 tables per report 3.6)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role { patient caregiver doctor }
enum SessionStatus { in_progress completed timed_out out_of_mistakes abandoned }
enum TrendDirection { improving stable declining }

model User {
  id           String   @id @default(uuid()) @map("user_id") @db.Uuid
  role         Role
  fullName     String   @map("full_name")
  email        String   @unique
  passwordHash String   @map("password_hash")
  languagePref String   @default("th") @map("language_pref")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz
  patientProfile PatientProfile?  @relation("PatientUser")
  doctorOf       PatientProfile[] @relation("AssignedDoctor")
  caregiverLinks CaregiverLink[]
  @@map("users")
}

model PatientProfile {
  patientId             String    @id @map("patient_id") @db.Uuid
  user                  User      @relation("PatientUser", fields: [patientId], references: [id], onDelete: Cascade)
  dateOfBirth           DateTime? @map("date_of_birth") @db.Date
  mciDiagnosisDate      DateTime? @map("mci_diagnosis_date") @db.Date
  baselineMocaScore     Int?      @map("baseline_moca_score") @db.SmallInt
  accessibilitySettings Json      @default("{}") @map("accessibility_settings")
  assignedDoctorId      String?   @map("assigned_doctor_id") @db.Uuid
  assignedDoctor        User?     @relation("AssignedDoctor", fields: [assignedDoctorId], references: [id])
  caregivers CaregiverLink[]
  sessions   GameSession[]
  snapshots  CognitiveTrendSnapshot[]
  @@index([assignedDoctorId])
  @@map("patient_profiles")
}

model CaregiverLink {
  caregiverId  String   @map("caregiver_id") @db.Uuid
  patientId    String   @map("patient_id") @db.Uuid
  relationship String?
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  caregiver User           @relation(fields: [caregiverId], references: [id], onDelete: Cascade)
  patient   PatientProfile @relation(fields: [patientId], references: [patientId], onDelete: Cascade)
  @@id([caregiverId, patientId])
  @@map("caregiver_links")
}

model CognitiveDomain {
  id     Int    @id @map("domain_id") @db.SmallInt
  key    String @unique
  nameTh String @map("name_th")
  color  String
  games   Game[]
  metrics MetricDefinition[]
  scores  SessionScore[]
  snapshots CognitiveTrendSnapshot[]
  @@map("cognitive_domains")
}

model Game {
  id              String  @id @default(uuid()) @map("game_id") @db.Uuid
  slug            String  @unique            // spot | oneback | maze
  name            String
  primaryDomainId Int     @map("primary_domain_id") @db.SmallInt
  primaryDomain   CognitiveDomain @relation(fields: [primaryDomainId], references: [id])
  isReady         Boolean @default(false) @map("is_ready")
  levels   GameLevel[]
  sessions GameSession[]
  scores   SessionScore[]
  metrics  MetricDefinition[]
  @@map("games")
}

model GameLevel {
  id                 String  @id @default(uuid()) @map("level_id") @db.Uuid
  gameId             String  @map("game_id") @db.Uuid
  game               Game    @relation(fields: [gameId], references: [id], onDelete: Cascade)
  tier               Int     @db.SmallInt     // 1..3
  entropyScore       Float?  @map("entropy_score")
  avgDifficultyScore Float?  @map("avg_difficulty_score")
  imagePath          String? @map("image_path")
  sessions GameSession[]
  @@unique([gameId, tier])
  @@map("game_levels")
}

model GameSession {
  id              String        @id @default(uuid()) @map("session_id") @db.Uuid
  patientId       String        @map("patient_id") @db.Uuid
  patient         PatientProfile @relation(fields: [patientId], references: [patientId], onDelete: Cascade)
  gameId          String        @map("game_id") @db.Uuid
  game            Game          @relation(fields: [gameId], references: [id])
  levelId         String?       @map("level_id") @db.Uuid
  level           GameLevel?    @relation(fields: [levelId], references: [id])
  difficultyTier  Int           @map("difficulty_tier") @db.SmallInt
  startedAt       DateTime      @default(now()) @map("started_at") @db.Timestamptz
  endedAt         DateTime?     @map("ended_at") @db.Timestamptz
  totalDurationMs Int?          @map("total_duration_ms")
  status          SessionStatus @default(in_progress) @map("session_status")
  events SessionEvent[]
  scores SessionScore[]
  @@index([patientId, startedAt])
  @@map("game_sessions")
}

model SessionEvent {
  id             String   @id @default(uuid()) @map("event_id") @db.Uuid
  sessionId      String   @map("session_id") @db.Uuid
  session        GameSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type           String   @map("event_type")   // click|hit|miss|hint|trial|...
  reactionTimeMs Int?     @map("reaction_time_ms")
  payload        Json     @default("{}")
  occurredAt     DateTime @map("occurred_at") @db.Timestamptz
  @@index([sessionId])
  @@map("session_events")
}

model MetricDefinition {
  id          Int     @id @default(autoincrement()) @map("metric_id")
  gameId      String  @map("game_id") @db.Uuid
  game        Game    @relation(fields: [gameId], references: [id], onDelete: Cascade)
  domainId    Int     @map("domain_id") @db.SmallInt
  domain      CognitiveDomain @relation(fields: [domainId], references: [id])
  maxRawScore Float   @map("max_raw_score")
  description String?
  @@unique([gameId, domainId])
  @@map("metric_definitions")
}

model SessionScore {
  id                 String   @id @default(uuid()) @map("score_id") @db.Uuid
  sessionId          String   @map("session_id") @db.Uuid
  session            GameSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  domainId           Int      @map("domain_id") @db.SmallInt
  domain             CognitiveDomain @relation(fields: [domainId], references: [id])
  gameId             String   @map("game_id") @db.Uuid    // denormalized per report
  game               Game     @relation(fields: [gameId], references: [id])
  errorRate          Float?   @map("error_rate")
  meanReactionTimeMs Int?     @map("mean_reaction_time_ms")
  rawScore           Float    @map("raw_score")
  normalizedScore    Float    @map("normalized_score")    // 0..100
  computedAt         DateTime @default(now()) @map("computed_at") @db.Timestamptz
  @@unique([sessionId, domainId])
  @@index([gameId])
  @@map("session_scores")
}

model CognitiveTrendSnapshot {
  id                 String   @id @default(uuid()) @map("snapshot_id") @db.Uuid
  patientId          String   @map("patient_id") @db.Uuid
  patient            PatientProfile @relation(fields: [patientId], references: [patientId], onDelete: Cascade)
  domainId           Int      @map("domain_id") @db.SmallInt
  domain             CognitiveDomain @relation(fields: [domainId], references: [id])
  periodStart        DateTime @map("period_start") @db.Date
  periodEnd          DateTime @map("period_end") @db.Date
  avgNormalizedScore Float    @map("avg_normalized_score")
  sessionCount       Int      @map("session_count")
  trendDirection     TrendDirection @map("trend_direction")
  flaggedForReview   Boolean  @default(false) @map("flagged_for_review")
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz
  @@unique([patientId, domainId, periodStart])
  @@index([flaggedForReview])
  @@map("cognitive_trend_snapshots")
}
```

Derived (not stored): `severity` = `baseline_moca_score >= 22 ? 'ระยะเริ่มต้น' : 'ปานกลาง'` (null if no MoCA); `age` from `date_of_birth`.

### Business rules (WP3, pure functions in `src/scoring/`)
- `normalize(raw, maxRaw) = clamp(round2(100*raw/maxRaw), 0, 100)`. Throws when maxRaw <= 0. If no `metric_definitions` row exists for (game, domain), the API returns 400.
- `computeTrend(curAvg, prevAvg|null)`: delta >= +5 → improving, <= -5 → declining, otherwise stable; null prev → stable. `flagged = declining || curAvg < 40`.
- Snapshot window: rolling 7 days ending today (periodStart = today-6). The previous window is days -13..-7. Upsert on (patient, domain, periodStart) after each completed session, for every domain the session scored.
- `patientStatus(latestSnapshots)`: none → `new`; any flagged → `watch`; any improving → `improving`; else `stable`.
- Alerts (computed, no table): `declining` (latest snapshot flagged; `critical = avg < 40 || delta <= -10`), `inactive` (last session >= 3 days ago, text "ไม่ได้เล่นเกม N วัน"), `improving` (delta >= +10, "คะแนนดีขึ้น N% สัปดาห์นี้").

### Redis keys
`sess:<jti>` → userId, TTL = token expiry (checked by guard, DEL on logout) · `cache:progress:<patientId>` JSON, TTL 300s, DEL on session completion · `lb:<gameSlug>` ZSET member=patientId score=best normalized (`ZADD GT`).

### Seed (WP2, `prisma/seed.ts`, idempotent: wipe then insert)
- 6 domains, 3 games (`spot` isReady=true), 3 levels each (tier 1..3), metric_definitions: spot→memory, focus; oneback→focus, speed; maze→direction, speed (maxRaw 100).
- Users (password `password123`): `doctor@cognicare.test` (นพ. ตัวอย่าง), `caregiver@cognicare.test` (linked to คุณสมชาย), and the 8 `PATIENTS` from the HTML (`patient1..8@cognicare.test`; DOB from age; MoCA 24 for ระยะเริ่มต้น, 20 for ปานกลาง), all assigned to the doctor. `patient@cognicare.test` is an alias email for คุณสมชาย (HTML `selfPatient = PATIENTS[3]`), i.e. patient4 uses that email.
- History: 49 days. Each day gets one completed `spot` session with 6 SessionScores, where domain d value = HTML `generateSeries(baseline[d], current[d], phase)` stretched over 49 days. Plus a few `oneback` sessions (HTML recentSessions). Today: 2 sessions for patient4 (goal 2/4).
- Snapshots: for each patient×domain, 7 weekly snapshots. `trend_direction` comes from the HTML status (watch→declining + flagged on domains where current < baseline; improving→improving; stable→stable). This makes the doctor view match the prototype (watch: สมหญิง, ประเสริฐ, บุญมี).

## 4. Shared API types (packages/shared/src/api-types.ts, verbatim)

```ts
export type Role = 'patient' | 'caregiver' | 'doctor';
export type DomainKey = 'focus' | 'speed' | 'direction' | 'language' | 'memory' | 'mood';
export type GameSlug = 'spot' | 'oneback' | 'maze';
export type SessionStatus = 'in_progress' | 'completed' | 'timed_out' | 'out_of_mistakes' | 'abandoned';
export type TrendDirection = 'improving' | 'stable' | 'declining';
export type PatientStatus = 'watch' | 'improving' | 'stable' | 'new';

export interface AccessibilitySettings { notif: boolean; sound: boolean; largeText: boolean }
export interface UserDto { id: string; role: Role; fullName: string; email: string; languagePref: string; settings: AccessibilitySettings | null }
export interface RegisterBody { email: string; password: string /* min 8 */; fullName: string; role: 'patient' | 'caregiver' }
export interface LoginBody { email: string; password: string }
export interface AuthResponse { accessToken: string; user: UserDto }

export interface GameDto { id: GameSlug; name: string; domain: DomainKey; ready: boolean }

export interface StartSessionBody { gameId: GameSlug; tier: 1 | 2 | 3 }
export interface StartSessionResponse { sessionId: string; startedAt: string }
export interface ScoreInput { domain: DomainKey; rawScore: number; errorRate?: number /*0..1*/; meanReactionTimeMs?: number }
export interface SessionEventInput { type: string; at: string /*ISO*/; reactionTimeMs?: number; data?: Record<string, unknown> }
export interface EndSessionBody { status: Exclude<SessionStatus, 'in_progress'>; totalDurationMs: number; scores: ScoreInput[] /*1..6*/; events?: SessionEventInput[] /*<=500*/ }
export interface SessionScoreDto { domain: DomainKey; rawScore: number; normalizedScore: number; errorRate: number | null; meanReactionTimeMs: number | null }
export interface SessionDto { id: string; gameId: GameSlug; tier: number; status: SessionStatus; startedAt: string; endedAt: string | null; totalDurationMs: number | null; score: number /*mean normalized, 0 if none*/; scores: SessionScoreDto[] }
export interface ResultsResponse { items: SessionDto[] }

export interface DomainProgress { domain: DomainKey; current: number /*avg last 7d*/; baseline: number /*avg first 7d of history*/; changePct: number; series: number[] /*30 daily values, carry-forward*/; trend: TrendDirection | null }
export interface ProgressResponse {
  patientId: string; status: PatientStatus;
  domains: DomainProgress[];            // 6 items, DOMAINS order
  sparkline: number[];                  // 7 weekly overall averages, oldest first
  today: { score: number; scoreChangePct: number | null; minutes: number; games: number };
  streakDays: number; totalSessions: number;
  best: DomainKey | null; weakest: DomainKey | null; lastSessionAt: string | null;
}
export interface PatientSummary {
  id: string; fullName: string; age: number | null; severity: string | null; status: PatientStatus;
  lastSessionAt: string | null; sessionsToday: number; avgScore: number | null;
  sparkline: number[]; baseline: number[] /*6*/; current: number[] /*6*/;
}
export interface AlertDto { id: string; patientId: string; patientName: string; kind: 'declining' | 'inactive' | 'improving'; critical: boolean; text: string; at: string }
export interface ActivityDto { patientName: string; gameId: GameSlug; score: number; at: string }
export interface AlertsResponse { alerts: AlertDto[]; activity: ActivityDto[] /*latest 10 completed sessions*/ }
export interface ReportResponse { patient: PatientSummary; from: string; to: string; progress: ProgressResponse; sessions: SessionDto[] }
export interface LeaderboardResponse { gameId: GameSlug; top: { rank: number; score: number; isMe: boolean }[]; me: { rank: number; score: number } | null }
export interface ApiError { statusCode: number; message: string | string[]; error?: string }
```

## 5. REST API (prefix `/api`, Bearer JWT unless public)

Access rule `AccessService.canAccessPatient(user, patientId)` (WP2): patient = self only; doctor = `assigned_doctor_id = user.id`; caregiver = row in `caregiver_links`. `:userId` accepts `me` (patients only). Validation uses a global `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})`. Errors use Nest's default `ApiError` shape.

| # | Method & path | Roles | Request | Response | Errors | WP |
|---|---|---|---|---|---|---|
| 1 | POST /auth/register | public | RegisterBody | 201 AuthResponse | 400, 409 email taken | 2 |
| 2 | POST /auth/login | public | LoginBody | 200 AuthResponse | 400, 401 | 2 |
| 3 | POST /auth/logout | any | | 204 | 401 | 2 |
| 4 | GET /auth/me | any | | 200 UserDto | 401 | 2 |
| 5 | GET /users/:id | self / access | | 200 UserDto | 403, 404 | 2 |
| 6 | PATCH /users/me/settings | patient | Partial<AccessibilitySettings> | 200 UserDto | 400 | 2 |
| 7 | GET /games | any | | 200 GameDto[] | | 2 |
| 8 | GET /health | public | | 200 {db:'ok',redis:'ok'} | 503 | 1 |
| 9 | POST /sessions | patient | StartSessionBody | 201 StartSessionResponse | 400 unknown game/tier | 3 |
| 10 | PUT /sessions/:id | patient (owner) | EndSessionBody | 200 SessionDto | 400, 403 not owner, 404, 409 not in_progress | 3 |
| 11 | GET /results/:userId?limit=20 | access | | 200 ResultsResponse (newest first, completed+ended only) | 403 | 3 |
| 12 | GET /progress/:userId | access | | 200 ProgressResponse (Redis-cached) | 403 | 3 |
| 13 | GET /patients | doctor, caregiver | ?status=&q= | 200 PatientSummary[] | 403 | 3 |
| 14 | GET /alerts | doctor, caregiver | | 200 AlertsResponse | 403 | 3 |
| 15 | GET /report/:userId?from=&to= | doctor, caregiver | ISO dates, default last 7d | 200 ReportResponse | 400, 403 | 3 |
| 16 | GET /leaderboard/:gameId | any | | 200 LeaderboardResponse (top 10, no names) | 400 | 3 |

PUT /sessions/:id runs in one Prisma transaction: set endedAt, duration, status; insert events and scores (normalized). After commit: recompute snapshots for the scored domains, `DEL cache:progress:<pid>`, `ZADD lb:<slug> GT`. Rows 1, 2, 5, 9, 10, 11, 12 are the report's 3.7 table (Table 3.16). The other rows are needed by the HTML views or the infra.

## 6. Game bridge contract (packages/shared/src/game-bridge.ts)

```ts
export const BRIDGE_VERSION = 1;
export type GameToHost =
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'ready' }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'session:start'; tier: 1 | 2 | 3 }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'session:event'; event: SessionEventInput }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'session:end'; result: EndSessionBody }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'exit' };
export type HostToGame =
  | { v: 1; source: 'cognicare-host'; type: 'init'; settings: AccessibilitySettings; locale: 'th' }
  | { v: 1; source: 'cognicare-host'; type: 'session:started'; sessionId: string }
  | { v: 1; source: 'cognicare-host'; type: 'session:saved'; session: SessionDto }
  | { v: 1; source: 'cognicare-host'; type: 'error'; message: string };
export function parseGameMessage(data: unknown, expectedGameId: GameSlug): GameToHost | null; // WP7 implements
```
Host rules (GameEmbed): accept only when `event.origin === location.origin`, `event.source === iframe.contentWindow`, and `parseGameMessage` returns non-null. The game never sees the JWT; the host makes all API calls. `ready` → send `init`. `session:start` → POST /sessions → `session:started`. Buffer `session:event` (cap 500) and attach them to `session:end` → PUT /sessions/:id → `session:saved`, or `error` on failure. `exit` → navigate to /patient/games. Iframe: `src="/games/<id>/index.html"`, `sandbox="allow-scripts allow-same-origin"`, `allow="fullscreen; autoplay"`. Unity note (GAME_BRIDGE.md): build with Compression = Disabled or "Decompression Fallback" ON, because Next static serving sets no Content-Encoding.

## 7. Web route map (HTML function → route)

| HTML (state) | Route | Component / WP |
|---|---|---|
| renderLanding (publicView=landing, LANDING_TABS) | `/` | app/page.tsx WP4 |
| renderLogin (publicView=login, loginRole switch) | `/login?role=patient\|doctor` | WP4 |
| renderTopbar + renderTabbar (navDefs) | layouts | AppShell WP4 |
| patient view=home renderPatientHome | `/patient` | WP5 (GET /progress/me, /results/me?limit=3, /games) |
| view=game gameSub=hub renderGameHub | `/patient/games` | WP5 |
| gameSub=playing/done renderGamePlay | `/patient/games/spot` (fallback when no Unity build) | SpotDemo WP5 |
| gameSub=soon renderComingSoon | `/patient/games/oneback`, `/maze` (until builds exist) | GameEmbed+ComingSoon WP7, page WP5 |
| view=rewards renderRewards | `/patient/rewards` | WP5 (badges static + GET /progress/me, /leaderboard/spot) |
| view=settings renderSettings | `/patient/settings`, `/doctor/settings` | Settings WP4 |
| doctor view=home renderDoctorHome (KPIs, search, filter, patient list, radar, session table, alerts aside) | `/doctor` (selected patient via `?p=<id>`) | WP6 (GET /patients, /results/:id, /progress/:id, /alerts) |
| view=alerts renderDoctorAlerts + alertCards | `/doctor/alerts` | WP6 |
| view=progress renderReport (domain boxes, trend chart, Export PDF) | `/doctor/report/[patientId]` | WP6 (GET /report/:id). Export PDF = `window.print()` + print CSS |

Login flow: POST /auth/login. The doctor tab accepts role doctor|caregiver and the patient tab accepts patient; on mismatch, log out and show `loginError`. Redirect to `/patient` or `/doctor`. A 401 shows "อีเมลหรือรหัสผ่านไม่ถูกต้อง". Layouts redirect to `/login` when there is no user, and to the user's own home when the role is wrong. Settings `largeText` sets `--font-scale: 1.15` (HTML `render()`).

## 8. Work packages

Waves: **W1** WP1 → **W2** WP2 ∥ WP3 ∥ WP4 ∥ WP7 → **W3** WP5 ∥ WP6 → **Opus verify**. No two WPs write the same file. Only WP1 edits any `package.json`. A worker that needs a new dependency stops and reports instead of adding it.

### WP1: Repo scaffold + docker (W1)
Owns: root files, `docker-compose.yml`, `packages/shared/**` (types/constants verbatim from §2, §4, §6, with `parseGameMessage` stubbed to `return null`), API and web skeletons as listed in §1, all module stubs, `schema.prisma` verbatim §3, health controller, `.env.example` files.
Deps: api: `@nestjs/{common,core,platform-express,jwt,throttler}@^11`, `@prisma/client@^6`, `ioredis`, `bcryptjs`, `class-validator`, `class-transformer`, `reflect-metadata`, `rxjs`, `@cognicare/shared`; dev: `@nestjs/{cli,testing}@^11`, `prisma@^6`, `jest@^29`, `ts-jest`, `@types/{jest,node,bcryptjs,supertest}`, `supertest`, `ts-node`, `typescript@^5`. web: `next@^15.5`, `react@^19`, `react-dom@^19`, `@cognicare/shared`; dev: `typescript`, `@types/{react,react-dom,node}`.
docker-compose: `postgres:16-alpine` (user/pass/db `cognicare`, volume `pgdata`, healthcheck `pg_isready`), `redis:7-alpine` (healthcheck `redis-cli ping`).
Jest config in api package.json: `collectCoverageFrom: ["src/**/*.service.ts","src/scoring/*.ts"]`, `coverageThreshold.global: {lines:80, statements:80, functions:80, branches:70}`.
Accept: `docker compose up -d` healthy; `npm install` succeeds and builds shared; `npx prisma validate` OK; `npm run typecheck` and `npm run build` pass; `npm run start:dev -w apps/api` → `GET /api/health` 200; `npm run dev -w apps/web` serves a placeholder page; first commit on `main`.

### WP2: API core: auth, users, games, migration, seed (W2)
Owns: `src/auth/**` (not auth.types.ts), `src/users/**`, `src/games/**`, `prisma/migrations/**`, `prisma/seed.ts`, `test/auth.e2e-spec.ts`, unit specs.
Exports, with fixed names that WP3 imports: `JwtAuthGuard` (`src/auth/jwt-auth.guard.ts`: verifies JWT + `sess:<jti>` exists, sets `req.user: AuthUser`), `RolesGuard` + `Roles(...roles)` (`src/auth/roles.{guard,decorator}.ts`), `CurrentUser()` (`src/auth/current-user.decorator.ts`), `AccessService` (`src/users/access.service.ts`, exported from `UsersModule`): `canAccessPatient(user, patientId): Promise<boolean>`, `resolvePatientId(user, param: string): string` ('me' → user.id for patients, else 400), `assertCanAccessPatient(user, patientId): Promise<void>` (403).
Endpoints 1-7. Throttler on the auth controller. CORS `WEB_ORIGIN` in main.ts is already WP1's.
Accept: `prisma migrate dev --name init` creates 11 tables with the report's column names (`\dt` shows them); `npm run db:seed` runs twice without error; unit tests for auth.service (hash, dup 409, bad pw 401, jti stored/removed) and access.service (all 3 roles plus deny); `auth.e2e-spec` green (register→login→me→logout→me 401; doctor register rejected 400; throttle 429 after 5 bad logins).

### WP3: API sessions, results, progress, report, patients, alerts, leaderboard, Redis (W2; e2e needs WP2 merged)
Owns: `src/scoring/**`, `src/sessions/**`, `src/progress/**`, `src/patients/**`, `src/leaderboard/**`, `test/sessions.e2e-spec.ts`, `docs/cognicare.postman_collection.json`.
Imports only WP2's exported names (§WP2) plus `PrismaService`/`RedisService`. Unit tests mock Prisma/Redis with plain jest objects.
Endpoints 9-16 and all business rules in §3.
Accept: unit specs for scoring/trend/status (all thresholds and edges), sessions.service (start; end: ownership 403, double end 409, unknown domain/metric 400, normalized values, cache DEL, ZADD called), progress.service (aggregation from fixture rows, cache hit skips Prisma), patients/alerts (status + alert kinds); service coverage >= 80% lines; `sessions.e2e-spec`: patient start→end→results contains it→progress.totalSessions +1, other patient's session PUT 403, doctor GET /patients 200 (8 seeded), patient GET /patients 403, caregiver sees only 1 patient; the Postman collection covers every endpoint with status-code tests (200/201/400/401/403/409).

### WP4: Web shell, design tokens, landing, login (W2)
Owns: files tagged WP4 in §1.
Port rules: copy the HTML `<style>` verbatim into `globals.css` (`:root` tokens, all classes). Load fonts Noto Sans Thai + Inter via `next/font/google` (or the same `<link>` as the HTML). Translate each `renderX` string template to JSX one to one (same classes, same Thai text, same aria labels). `data-action` handlers become onClick. `lib/api.ts` exposes `api.login/register/logout/me/updateSettings/games/startSession/endSession/results/progress/patients/alerts/report/leaderboard`, typed with shared types; it throws `ApiError`, and a 401 clears auth and sends the user to /login.
Accept: `/` matches renderLanding (all LANDING_TABS work); `/login` role switch, empty-field error text, 401 error text, and a successful login per role all redirect correctly; AppShell nav highlights the current route (`aria-current="page"`); large-text toggle persists through the API; `npm run typecheck -w apps/web` and `npm run build -w apps/web` pass; the page works at 360px width.

### WP5: Web patient views (W3)
Owns: files tagged WP5 in §1.
Home: hero greeting with `user.fullName`, goal `today.games / DAILY_GOAL`, quickStats (score today + change, minutes, best, weakest), recommended games grid, and recent sessions from `/results/me?limit=3`. Game hub: GAMES cards; `ready` from GET /games. `[id]` page: unknown id → `notFound()`. Renders `<GameEmbed gameId onStart onEnd fallback={id==='spot' ? <SpotDemo/> : undefined}/>`, plus `id==='mock'` only when `process.env.NODE_ENV!=='production'`. SpotDemo ports sceneSvg/DIFF_SPOTS/timer 180s/3 hints/5 spots/found dots/done screen (and the toast if present). On start it calls POST /sessions `{gameId:'spot',tier:1}`. On finish it calls PUT with `status` completed|timed_out|abandoned (on exit), `scores=[{domain:'memory',rawScore:found*20,errorRate:wrong/clicks},{domain:'focus',rawScore:round(100*(1-errorRate))}]`. Rewards: achievementStats from progress (badges earned/total, streakDays, totalSessions); badges are verbatim from the HTML with unlock rules in `lib/rewards.ts` (unknown rule → keep the HTML `locked` value); my rank comes from `/leaderboard/spot`.
Accept: logged in as `patient@cognicare.test`, home shows seeded numbers (goal 2/4); a full Spot game run creates a completed session, and home/recent update without a reload issue; oneback/maze show ComingSoon with a back button; typecheck + build pass.

### WP6: Web doctor views (W3)
Owns: files tagged WP6 in §1.
Home: KPIs (patient count, sum of sessionsToday, count of status=watch with the "ด่วน" badge, mean avgScore), search (`q` client-side), status filter chips, PatientList with Sparkline, selected patient panel (Radar baseline vs current, last sessions table with pass mark score>=60 "ผ่าน"/"ต้องพัฒนา", "ดูรายงานเต็ม" → report). Empty-history state for `status=new`. Aside: AlertCards (compact) + activity feed. Alerts page: full AlertCards + activity. Report: header with date range badge (Thai format), 6 domain boxes (score, changePct up/down, sparkline from series), the HTML trend chart (per-domain toggles = `trendVisible`, pagination = `reportPage` if present), Export PDF → `window.print()`. Caregiver: same pages, read-only (hide "นัดหมาย" and "ส่งคำเชิญ").
Accept: as `doctor@cognicare.test`, 8 patients are listed and 3 are watch (สมหญิง, ประเสริฐ, บุญมี); filter/search work; report renders for any patient; the caregiver sees 1 patient; typecheck + build pass.

### WP7: Game embed + contract (W2)
Owns: `components/GameEmbed.tsx`, `components/ComingSoon.tsx`, `packages/shared/src/game-bridge.ts` (implement `parseGameMessage` only; types are frozen), `packages/shared/test/game-bridge.test.mjs`, `apps/web/public/games/mock/index.html`, `docs/GAME_BRIDGE.md`, `docs/unity/CogniCareBridge.jslib`.
GameEmbed props: `{ gameId: GameSlug | 'mock'; settings: AccessibilitySettings; onStart(tier): Promise<StartSessionResponse>; onEnd(sessionId, body: EndSessionBody): Promise<SessionDto>; onExit(): void; fallback?: ReactNode }`. States: checking → (HEAD 200) iframe | (else) fallback ?? `<ComingSoon name/>`. It owns no API calls (the page injects them).
Mock game: buttons Start / Send event / End(completed, random scores) / Exit, plus a log of received HostToGame messages.
Accept: `node --test packages/shared/test` passes (valid messages parsed; wrong source/version/gameId/shape → null; oversized events array rejected); with WP5 merged, `/patient/games/mock` in dev completes a session through the bridge and it appears in /results; foreign-origin messages are ignored; ComingSoon matches renderComingSoon.

## 9. Test plan

| Layer | Tool | Owner | Command | Gate |
|---|---|---|---|---|
| API unit (services + scoring) | Jest + ts-jest, mocked Prisma/Redis | WP2, WP3 | `npm test` | all pass; coverage lines >= 80% on `*.service.ts` + `scoring/*` (report 3.9.3-1) |
| API e2e | Jest + supertest against docker PG/Redis (seeded DB; unique emails per run) | WP2 auth, WP3 sessions | `npm run test:e2e` | green; asserts 200/201/400/401/403/409 |
| API contract | Postman collection | WP3 | import / `npx newman run docs/cognicare.postman_collection.json` | all tests pass (report 3.9.3-2) |
| Bridge | node:test | WP7 | `node --test packages/shared/test` | pass |
| Web | tsc + next build | WP4-7 | `npm run typecheck && npm run build` | 0 errors |
| Web smoke | manual (agent-browser) | Opus | below | all steps pass |
| Usability | SUS + observation form | humans (UAT, 3.9.2) | — | out of scope for code; SUS >= 68 target |

**Opus final verification (in order):**
1. Clean clone → `npm install` → `docker compose up -d` → `npm run db:migrate && npm run db:seed` with no manual steps beyond copying `.env.example`.
2. `npm run typecheck`, `npm run build`, `npm test` (read the coverage table: >= 80%), `npm run test:e2e`, and `node --test packages/shared/test` all pass.
3. Run both apps. Browser smoke: landing tabs work → login as patient → home numbers present → play Spot to completion → recent sessions updates → rewards → settings large text persists after reload → logout. Then login as doctor → 3 watch patients → select one → radar + table → report → print dialog → alerts. Then the caregiver sees 1 patient. Also: patient token on `/api/patients` → 403, and after logout the old token → 401.
4. `/patient/games/mock` round trip via postMessage, and oneback/maze show ComingSoon.
5. Visual diff vs the HTML prototype at 1280px and 375px for landing, login, patient home, doctor home, report (same tokens, fonts, Thai copy).
6. Grep checks: no `any` in shared, no secrets committed, `.env` gitignored, and no file edited outside its WP ownership (`git log --stat` per WP branch).
