import type { Tier, AccessibilitySettings, EndSessionBody, GameSlug, SessionDto, SessionEventInput } from './api-types';

export const BRIDGE_VERSION = 1;

export type GameToHost =
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'ready' }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'session:start'; tier: Tier }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'session:event'; event: SessionEventInput }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'session:end'; result: EndSessionBody }
  | { v: 1; source: 'cognicare-game'; gameId: GameSlug; type: 'exit' };

export type HostToGame =
  | { v: 1; source: 'cognicare-host'; type: 'init'; settings: AccessibilitySettings; locale: 'th' }
  | { v: 1; source: 'cognicare-host'; type: 'session:started'; sessionId: string }
  | { v: 1; source: 'cognicare-host'; type: 'session:saved'; session: SessionDto }
  | { v: 1; source: 'cognicare-host'; type: 'error'; message: string };

const MAX_EVENTS = 500;
export const MAX_METRICS_BYTES = 32 * 1024;
export const MAX_METRICS_DEPTH = 4;
const END_STATUSES = ['completed', 'timed_out', 'out_of_mistakes', 'abandoned'];
const DOMAIN_KEYS = ['focus', 'speed', 'direction', 'language', 'memory', 'mood'];

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const optNum = (x: unknown) => x === undefined || isNum(x);

function depthOk(x: unknown, d: number): boolean {
  if (typeof x === 'number') return Number.isFinite(x); // 1e400 parses to Infinity and would be stored as null
  if (typeof x !== 'object' || x === null) return true;
  if (d > MAX_METRICS_DEPTH) return false;
  return Object.values(x).every((v) => depthOk(v, d + 1));
}

/** Plain object, nesting depth <= 4 (top level = 1), JSON size <= 32KB (UTF-16 length; ponytail: not exact bytes). */
export function isValidMetrics(m: unknown): boolean {
  if (!isRec(m) || !depthOk(m, 1)) return false;
  try {
    return JSON.stringify(m).length <= MAX_METRICS_BYTES;
  } catch {
    return false;
  }
}

function validEvent(e: unknown): boolean {
  return isRec(e) && typeof e.type === 'string' && typeof e.at === 'string' && optNum(e.reactionTimeMs) &&
    (e.data === undefined || isRec(e.data));
}

function validEnd(r: unknown): boolean {
  if (!isRec(r) || !END_STATUSES.includes(r.status as string) || !isNum(r.totalDurationMs)) return false;
  if (!Array.isArray(r.scores) || r.scores.length < 1 || r.scores.length > 6) return false;
  const scoresOk = r.scores.every(
    (s) => isRec(s) && DOMAIN_KEYS.includes(s.domain as string) && isNum(s.rawScore) && optNum(s.errorRate) && optNum(s.meanReactionTimeMs),
  );
  if (!scoresOk) return false;
  if (r.metrics !== undefined && !isValidMetrics(r.metrics)) return false;
  return r.events === undefined || (Array.isArray(r.events) && r.events.length <= MAX_EVENTS && r.events.every(validEvent));
}

/** Validates a postMessage payload from the game iframe. Returns null for anything not a well-formed bridge message. */
export function parseGameMessage(data: unknown, expectedGameId: GameSlug): GameToHost | null {
  if (!isRec(data) || data.v !== BRIDGE_VERSION || data.source !== 'cognicare-game' || data.gameId !== expectedGameId) return null;
  switch (data.type) {
    case 'ready':
    case 'exit':
      return data as GameToHost;
    case 'session:start':
      return typeof data.tier === 'number' && Number.isInteger(data.tier) && data.tier >= 1 && data.tier <= 5 ? (data as GameToHost) : null;
    case 'session:event':
      return validEvent(data.event) ? (data as GameToHost) : null;
    case 'session:end':
      return validEnd(data.result) ? (data as GameToHost) : null;
    default:
      return null;
  }
}
