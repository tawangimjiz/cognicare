import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGameMessage } from '../dist/index.js';

const base = { v: 1, source: 'cognicare-game', gameId: 'spot' };
const end = { status: 'completed', totalDurationMs: 1000, scores: [{ domain: 'memory', rawScore: 5 }] };

test('valid messages parse', () => {
  for (const m of [
    { ...base, type: 'ready' },
    { ...base, type: 'exit' },
    { ...base, type: 'session:start', tier: 2 },
    { ...base, type: 'session:event', event: { type: 'tap', at: '2026-01-01T00:00:00Z', reactionTimeMs: 300 } },
    { ...base, type: 'session:end', result: end },
  ]) assert.deepEqual(parseGameMessage(m, 'spot'), m);
});

test('wrong source/version/gameId/type/shape -> null', () => {
  const bad = [
    null, 'x', [], {},
    { ...base, type: 'ready', source: 'evil' },
    { ...base, type: 'ready', v: 2 },
    { ...base, type: 'ready', gameId: 'maze' },
    { ...base, type: 'nope' },
    { ...base, type: 'session:start', tier: 4 },
    { ...base, type: 'session:event', event: { type: 'tap' } },
    { ...base, type: 'session:end', result: { ...end, status: 'in_progress' } },
    { ...base, type: 'session:end', result: { ...end, scores: [] } },
    { ...base, type: 'session:end', result: { ...end, scores: [{ domain: 'x', rawScore: 1 }] } },
  ];
  for (const m of bad) assert.equal(parseGameMessage(m, 'spot'), null);
});

test('oversized events array rejected', () => {
  const ev = { type: 'tap', at: '2026-01-01T00:00:00Z' };
  const mk = (n) => ({ ...base, type: 'session:end', result: { ...end, events: Array(n).fill(ev) } });
  assert.ok(parseGameMessage(mk(500), 'spot'));
  assert.equal(parseGameMessage(mk(501), 'spot'), null);
});
