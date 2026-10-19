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

### Production bootstrap (create doctors/caregivers, link them)

Self-registration only offers patient/caregiver, so create the first accounts with the admin CLI (inside the api
container; the same commands work locally as `npm run user:create -- ...`). Passwords are never taken from argv:
set `CREATE_USER_PASSWORD`, or use `--generate` (prints a 20-char password once), or omit both to get a hidden prompt
(needs `-it`, i.e. drop `-T` on non-interactive shells). The commands refuse duplicate emails and never modify existing users.

```bash
C="docker compose -f docker-compose.prod.yml exec api"
$C npm run -s user:create -- --email dr@clinic.example --name "Dr. Somchai" --role doctor --generate
read -rs PW   # type the password here, never literally in a command (shell history / ps)
CREATE_USER_PASSWORD="$PW" docker compose -f docker-compose.prod.yml exec -e CREATE_USER_PASSWORD api npm run -s user:create -- --email p@example.com --name "Somchai" --role patient
$C npm run -s user:create -- --email c@example.com --name "Daughter" --role caregiver --generate   # --language th|en optional

# idempotent; emails of existing users. --relationship is optional
$C npm run -s user:link -- --patient p@example.com --caregiver c@example.com --relationship daughter
$C npm run -s user:link -- --patient p@example.com --doctor dr@clinic.example
```

Roles: `patient` (also gets a patient profile), `caregiver`, `doctor`. Exit code is non-zero on any error. To pass a
variable into the container use `exec -e CREATE_USER_PASSWORD api ...` (as in the patient example above).

 CI (`.github/workflows/ci.yml`) runs typecheck, unit + e2e tests and the web build on push/PR to main.
