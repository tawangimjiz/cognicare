# CogniCare

Brain-training and follow-up platform for people with MCI. Monorepo:

| Path | What |
|---|---|
| `packages/shared` | Domain constants, API types, game bridge (`parseGameMessage`) |
| `apps/api` | NestJS 11 + Prisma 6 (PostgreSQL) + Redis, REST under `/api` |
| `apps/web` | Next.js 15 (patient, doctor, caregiver UI) |
| `docs/` | `PLAN.md`, `GAME_BRIDGE.md`, Postman collection, Unity jslib |

## Ports

| Service | Port |
|---|---|
| Web | 3000 |
| API | 4000 (`/api/health`) |
| PostgreSQL (docker) | **5433** on the host (5432 is often taken by a local Postgres; override with `POSTGRES_PORT`) |
| Redis (docker) | 6379 |

## Setup

Requires Node 20.12+ (tested on 24), npm 10+, Docker.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d --wait
npm install            # also builds packages/shared and generates the Prisma client
npm run db:migrate     # prisma migrate deploy
npm run db:seed        # wipes and reseeds demo data; safe to rerun
```

## Run

Development:

```bash
npm run dev:api        # http://localhost:4000/api
npm run dev:web        # http://localhost:3000
```

Production build:

```bash
npm run build
NODE_ENV=production JWT_SECRET=<random 32+ chars> npm run start -w apps/api
npm run start -w apps/web
```

The API loads `apps/api/.env` at startup (real env vars win). With `NODE_ENV=production` it refuses to start
if `JWT_SECRET` is missing, `change-me`, or shorter than 32 characters.

## Demo accounts (password `password123`)

| Email | Role | Notes |
|---|---|---|
| `patient@cognicare.test` | patient | คุณสมชาย, goal 2/4 today after a fresh seed |
| `patient1@` … `patient8@cognicare.test` (not 4) | patient | the other 7 seeded patients |
| `doctor@cognicare.test` | doctor | sees all 8 patients, 3 on watch |
| `caregiver@cognicare.test` | caregiver | sees 1 patient (คุณสมชาย), read-only |

Login is rate limited to 5 attempts per minute per IP.

## Tests

```bash
npm run typecheck
npm test                                    # API unit tests + coverage gate (80% lines)
npm run test:e2e                            # needs docker up + seeded DB
node --test packages/shared/test/*.test.mjs # game bridge
npx newman run docs/cognicare.postman_collection.json   # needs the API running on :4000
```

`/patient/games/mock` (a fake game that speaks the bridge) exists only in dev (`npm run dev:web`).
Day boundaries ("today", streaks, report ranges) use Asia/Bangkok time.

## Deploy

Docker (postgres, redis, api, web; db/redis not exposed to the host). The API runs `prisma migrate deploy` on start.

| Env var | Required | Default | Notes |
|---|---|---|---|
| `POSTGRES_PASSWORD` | yes | | DB password |
| `JWT_SECRET` | yes | | 32+ random chars |
| `PUBLIC_API_URL` | no | `http://localhost:4000/api` | API URL as seen by browsers; baked into the web build |
| `WEB_ORIGIN` | no | `http://localhost:3000` | CORS origin allowed by the API |
| `API_PORT` / `WEB_PORT` | no | 4000 / 3000 | host ports |

```bash
export POSTGRES_PASSWORD=... JWT_SECRET=$(openssl rand -hex 24)
docker compose -f docker-compose.prod.yml up -d --build --wait
curl localhost:4000/api/health
```

Changing `PUBLIC_API_URL` needs `--build`.

The prod stack starts with an empty database (no accounts; doctors cannot self-register). For a demo/staging stack only,
load the demo data with `docker compose -f docker-compose.prod.yml exec api npm run db:seed`: it **wipes all tables**
and creates the demo accounts with the public password `password123`, so never run it on a real deployment.

 CI (`.github/workflows/ci.yml`) runs typecheck, unit + e2e tests and the web build on push/PR to main.
