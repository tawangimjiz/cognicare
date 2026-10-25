# CogniCare game bridge

Unity WebGL builds live at `apps/web/public/games/<gameId>/index.html` (`spot`, `oneback`, `maze`) and run in an iframe on the **same origin** as the web app. They talk to the host with `window.postMessage`. The host owns all API calls; the game never sees the JWT. Types: `packages/shared/src/game-bridge.ts` (`BRIDGE_VERSION = 1`).

## Flow
1. Game loads, sends `ready`. Host replies `init` `{settings, locale:'th'}` (apply `largeText` / `sound`).
2. Game sends `session:start {tier}`. Host calls `POST /sessions`, replies `session:started {sessionId}`.
3. Optional `session:event {event}` (currently ignored by the host; put events in `session:end.result.events` instead).
4. Game sends `session:end {result}`. Host calls `PUT /sessions/:id`, replies `session:saved {session}` (or `error {message}`).
5. Game sends `exit` to return to the hub.

## Game -> host (all carry `v:1, source:'cognicare-game', gameId`)
| type | extra fields |
|---|---|
| `ready` | |
| `session:start` | `tier: 1..5` (1 easy, 2 medium, 3 hard, 4 = 2-back, 5 = 3-back; a tier needs a `game_levels` row, created for all games by the `reference_data` migration) |
| `session:event` | `event: {type, at(ISO), reactionTimeMs?, data?}` |
| `session:end` | `result: {status: completed\|timed_out\|out_of_mistakes\|abandoned, totalDurationMs, scores: [{domain, rawScore, errorRate?, meanReactionTimeMs?}] (1..6), events?: (<=500), metrics?: object}` |
| `exit` | |

`result.metrics` (optional): plain JSON object (not an array), nesting depth <= 4 (top level = 1, arrays count as a level), `JSON.stringify` length <= 32768 characters, numbers must be finite; otherwise the message is dropped by the host (and the API answers 400). Stored in `game_sessions.metrics` (JSONB), not returned by the API. Use it for clinical values (e.g. oneback: `dPrime`, criterion, hit/false-alarm rates, per-condition RT). `events[].data` may be any plain object (not an array). The API additionally requires `at` to be ISO 8601, `reactionTimeMs` / `meanReactionTimeMs` to be integers >= 0, `rawScore >= 0` and `errorRate` in 0..1. The whole `PUT /sessions/:id` JSON body is capped at 512KB.

### oneback conventions
- Scores domain is `focus` (optionally `speed`), e.g. `{domain:'focus', rawScore, errorRate, meanReactionTimeMs}`.
- Each trial is one entry in `result.events` (`type:'trial'`, `at`, `reactionTimeMs?`, `data:{index, nBack, isTarget, responded, correct}`), max 500.
- `status:'abandoned'` when the player quits early; send `session:end` with whatever scores exist (at least one score is required). `session:event` is still ignored by the host.
- No query params and no token: the build is loaded as `/games/oneback/index.html` and the host owns auth.

`gameId` must equal the slug of the embedding page. Anything with a wrong `v`, `source`, `gameId`, type or shape is silently dropped (`parseGameMessage` returns null), as are messages from another origin or window.

## Host -> game (`v:1, source:'cognicare-host'`)
`init {settings, locale}`, `session:started {sessionId}`, `session:saved {session}`, `error {message}`.

## Unity
Copy `docs/unity/CogniCareBridge.jslib` to `Assets/Plugins/WebGL/`. Call `CogniCareListen()` once at start, `CogniCareSend(json)` to send, and implement `OnHostMessage(string json)` on a GameObject named `CogniCareBridge`.

## Unity build notes
- Player Settings > Publishing > Compression Format = **Disabled** (Next static hosting does not send `Content-Encoding` for .br/.gz builds).
- Builds are not committed (no Git LFS). `npm run game:publish` zips the build as a GitHub release asset (limit 2 GB per file, warns above 500 MB); only `public/games/<id>/version.json` is in git and `npm run game:fetch` downloads the build. Also enable Name Files As Hashes. See README "Updating a game build".

## Testing without Unity
`/patient/games/mock` loads `public/games/mock/index.html` (speaks as `spot`, tier 1). `/patient/games/mock-oneback` loads the same page with `?mode=oneback` (speaks as `oneback`, tier 4, trial events and a realistic `metrics` payload) with Start / Send event / End / Exit buttons and a log of host messages.
