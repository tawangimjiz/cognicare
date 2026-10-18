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
| `session:start` | `tier: 1\|2\|3` |
| `session:event` | `event: {type, at(ISO), reactionTimeMs?, data?}` |
| `session:end` | `result: {status: completed\|timed_out\|out_of_mistakes\|abandoned, totalDurationMs, scores: [{domain, rawScore, errorRate?, meanReactionTimeMs?}] (1..6), events?: (<=500)}` |
| `exit` | |

`gameId` must equal the slug of the embedding page. Anything with a wrong `v`, `source`, `gameId`, type or shape is silently dropped (`parseGameMessage` returns null), as are messages from another origin or window.

## Host -> game (`v:1, source:'cognicare-host'`)
`init {settings, locale}`, `session:started {sessionId}`, `session:saved {session}`, `error {message}`.

## Unity
Copy `docs/unity/CogniCareBridge.jslib` to `Assets/Plugins/WebGL/`. Call `CogniCareListen()` once at start, `CogniCareSend(json)` to send, and implement `OnHostMessage(string json)` on a GameObject named `CogniCareBridge`.

## Testing without Unity
`/patient/games/mock` loads `public/games/mock/index.html` (speaks as `spot`) with Start / Send event / End / Exit buttons and a log of host messages.
