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
| PostgreSQL (docker) | **5433** on the host (5432 is often taken by a local Postgres; override with `POSTGRES_PORT`). Needs PostgreSQL 13+ (migrations use built-in `gen_random_uuid()`); docker uses 16 |
| Redis (docker) | 6379 |

## Setup

Requires Node 20.12+ (tested on 24), npm 10+, Docker.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d --wait
npm install            # also builds packages/shared and generates the Prisma client
npm run db:migrate     # prisma migrate deploy
npm run db:seed        # replaces users and sessions with demo data; safe to rerun (domains, games and levels come from migrations)
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
node --test scripts/*.test.mjs   # game publish/fetch scripts (also run by npm test)
npx newman run docs/cognicare.postman_collection.json   # needs the API running on :4000
```

`/patient/games/mock` (a fake game that speaks the bridge) exists only in dev (`npm run dev:web`).
Day boundaries ("today", streaks, report ranges) use Asia/Bangkok time.

## Updating a game build

Unity WebGL builds are **not stored in git** (no Git LFS). Each build is a GitHub **release asset**
(`game-<id>-<version>` / `<id>-<version>.zip`, hard limit 2 GB per asset); git holds only the small manifest
`apps/web/public/games/<id>/version.json` (`spot`, `oneback`, `maze`). The build files themselves are git-ignored and
are downloaded by `npm run game:fetch`.

1. In Unity, Player Settings > Publishing Settings: set **Compression Format = Disabled** (Next.js does not send
   `Content-Encoding`, so `.br`/`.gz`/`.unityweb` files fail to load) and enable **Name Files As Hashes** (the
   `Build/` file names then change whenever the content changes, so browsers never reuse a stale `.wasm`/`.data`).
2. Build for WebGL into a directory outside the repo.
3. Publish: `npm run game:publish -- <gameId> <path-to-unity-build-dir> [--dry-run] [--release]`. It validates the build
   (index.html, Build/ with loader/framework/data/wasm, TemplateData/), installs it locally into
   `apps/web/public/games/<id>/` (via a temp dir; stale hashed files disappear; other games are untouched), builds
   `dist-games/<id>-<version>.zip` (git-ignored; deterministic zip written by the script itself, no extra dependency),
   writes the manifest and prints per-file sizes (warns above 500 MB, fails above 2 GB) and loud warnings about compressed files.
   `--dry-run` validates and reports without writing. Source and destination must be different directories.
4. Upload the zip as a release asset. Either re-run the publish with `--release` (needs `gh auth login`; refuses unless the
   `origin` remote is `tawangimjiz/cognicare`, override with `GAME_RELEASE_REPO=owner/repo`; creates the release, or
   `gh release upload --clobber` if the tag exists; prints the release URL) or run the `gh release create ...` command that
   the script prints when `--release` is not given. Uploading is never automatic.
5. Commit **only** `apps/web/public/games/<id>/version.json`:
   `{"version": "<12 hex>", "publishedAt": "<ISO>", "tag": "game-<id>-<version>", "asset": "<id>-<version>.zip", "sha256": "<zip sha256>", "bytes": N}`.
   `GameEmbed` fetches it (no-store) and loads the page as `index.html?v=<version>` (only `version` is used), so the page itself is
   re-fetched when the build changes. A game without a manifest or build shows the "coming soon" screen.
6. Everyone else runs `npm run game:fetch` after pulling: for each game whose build is missing or whose
   `public/games/<id>/.fetched-version` differs from the manifest it downloads the release asset (`gh release download` when `gh`
   is authenticated, otherwise a plain HTTPS download from `https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>`),
   verifies size and sha256 against the manifest (mismatch = error, nothing is extracted), extracts safely (no `..`, absolute
   paths or symlinks; only `index.html`, `Build/`, `TemplateData/`) into a temp dir and swaps it in. Up-to-date games are skipped.
   Only zips written by `game:publish` are supported: zips from other tools are usually rejected (Windows PowerShell 5.1
   `Compress-Archive` writes `\` separators, `zip -r`/7-Zip add directory entries).
   `npm run game:fetch -- --check` only reports missing/outdated games (no network, exit 1 if any). `<owner>/<repo>` comes from
   `GAME_RELEASE_REPO` or the `origin` remote.

**Rollback.** Edit `version.json` back to the older manifest (`git checkout <rev> -- apps/web/public/games/<id>/version.json`; the old
release asset `game-<id>-<old version>` still exists, never delete releases you may roll back to) and run `npm run game:fetch`.

**Private repo.** Anonymous downloads fail for a private repository. Either `gh auth login` (used first) or set
`GAME_FETCH_TOKEN` to a token with read access to the repo contents (fine-grained PAT, "Contents: read").

**Docker.** `apps/web/Dockerfile` runs `node scripts/game-fetch.mjs` before `next build` (alpine has no `gh`/`git`, so it uses
HTTPS and the `GAME_RELEASE_REPO` build arg, default `tawangimjiz/cognicare`). For a private repo pass the token as a BuildKit
secret, not an arg: `GAME_FETCH_TOKEN=... docker compose -f docker-compose.prod.yml build web` (compose maps it to the
`game_fetch_token` secret; it never enters image layers or history). `SKIP_GAME_FETCH=1` skips the download with a loud warning
(the games then show "coming soon"). A missing release or a checksum mismatch fails the image build. Rebuild after publishing:
`docker compose -f docker-compose.prod.yml up -d --build`.

**CI** does not fetch games: tests and `next build` pass with only the manifests checked out.

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

The prod stack starts with no accounts (doctors cannot self-register). Domains, games, levels and metric definitions
are created by the migrations, so sessions work without the seed. For a demo/staging stack only, load the demo data with
`docker compose -f docker-compose.prod.yml exec api npm run db:seed`: it **wipes all users and sessions** and creates the
demo accounts with the public password `password123`, so never run it on a real deployment.

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
