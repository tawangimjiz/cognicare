'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EndSessionBody } from '@cognicare/shared';
import { Icon } from '../Icon';
import { api } from '../../lib/api';

const DIFF_SPOTS = [
  { id: 1, x: 82, y: 14 },
  { id: 2, x: 68, y: 16 },
  { id: 3, x: 22, y: 46 },
  { id: 4, x: 80, y: 70 },
  { id: 5, x: 15, y: 78 },
];
const TOTAL_TIME = 180;

function Scene({ variant }: { variant: 1 | 2 }) {
  const v1 = variant === 1;
  return (
    <svg width="100%" height="100%" viewBox="0 0 420 300" preserveAspectRatio="xMidYMid slice">
      <rect width="420" height="300" fill="#DCEFEA" />
      <rect y="240" width="420" height="60" fill="#8FCB9A" />
      <circle cx="345" cy="45" r="26" fill={v1 ? '#F39C12' : '#E8B923'} />
      {v1 && <ellipse cx="290" cy="55" rx="30" ry="14" fill="#FFFFFF" />}
      <rect x="80" y="150" width="14" height="90" fill="#8A5A3B" />
      <circle cx="87" cy="140" r={v1 ? 50 : 34} fill="#3F9E5C" />
      <rect x="310" y="220" width="60" height="20" fill="#A9744F" />
      {v1 && <rect x="330" y="230" width="16" height="16" fill="#EAF6FF" />}
      {v1 && <circle cx="63" cy="255" r="10" fill="#E96FA6" />}
    </svg>
  );
}

export default function SpotDemo() {
  const router = useRouter();
  const [phase, setPhase] = useState<'playing' | 'done'>('playing');
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [hintSpot, setHintSpot] = useState<number | null>(null);
  const [foundIds, setFoundIds] = useState<number[]>([]);
  const [saveError, setSaveError] = useState('');

  // Mutable game facts read by finish() (avoids stale closures from the interval).
  const g = useRef({ found: 0, ids: [] as number[], wrong: 0, startedAt: Date.now(), sessionId: null as string | null, ended: true });
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(async (status: 'completed' | 'timed_out' | 'abandoned') => {
    const s = g.current;
    if (s.ended) return;
    s.ended = true;
    const clicks = s.found + s.wrong;
    const errorRate = clicks ? s.wrong / clicks : 0;
    const body: EndSessionBody = {
      status,
      totalDurationMs: Date.now() - s.startedAt,
      scores: [
        { domain: 'memory', rawScore: s.found * 20, errorRate },
        { domain: 'focus', rawScore: Math.round(100 * (1 - errorRate)) },
      ],
    };
    if (!s.sessionId) return;
    try { await api.endSession(s.sessionId, body); } catch (e) { setSaveError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
  }, []);

  const start = useCallback(async () => {
    g.current = { found: 0, ids: [], wrong: 0, startedAt: Date.now(), sessionId: null, ended: false };
    setPhase('playing'); setTimeLeft(TOTAL_TIME); setHintsLeft(3); setHintSpot(null); setFoundIds([]); setSaveError('');
    const mine = g.current;
    try {
      const r = await api.startSession({ gameId: 'spot', tier: 1 });
      mine.sessionId = r.sessionId;
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'เริ่มเซสชันไม่สำเร็จ'); }
  }, []);

  useEffect(() => { void start(); }, [start]);

  // countdown
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'playing' && timeLeft <= 0) { setPhase('done'); void finish('timed_out'); }
  }, [timeLeft, phase, finish]);

  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const click = (id: number) => {
    const s = g.current;
    if (phase !== 'playing' || s.ids.includes(id)) return;
    s.ids = [...s.ids, id];
    s.found = s.ids.length;
    setFoundIds(s.ids);
    setHintSpot(null);
    if (s.found >= 5) { setPhase('done'); void finish('completed'); }
  };

  const useHint = () => {
    if (hintsLeft <= 0) return;
    const rest = DIFF_SPOTS.find((sp) => !foundIds.includes(sp.id));
    if (!rest) return;
    setHintsLeft((h) => h - 1);
    setHintSpot(rest.id);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintSpot((cur) => (cur === rest.id ? null : cur)), 2000);
  };

  const exit = async () => {
    await finish('abandoned');
    router.push('/patient/games');
  };

  const mm = Math.floor(Math.max(timeLeft, 0) / 60), ss = Math.max(timeLeft, 0) % 60;
  const timeLabel = `${mm < 10 ? '0' + mm : mm}:${ss < 10 ? '0' + ss : ss}`;
  const found = foundIds.length;
  const score = found * 20;

  return (
    <>
      <div className="game-topbar glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="h2">จับผิดภาพ</div>
          <div className="domain-chip"><Icon name="brain" size={14} /> ความจำ</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="timer" style={{ color: timeLeft <= 30 ? 'var(--c-danger)' : 'var(--c-text)' }}><Icon name="clock" size={18} /> {timeLabel}</div>
          <button className="btn btn-ghost btn-sm" onClick={useHint} disabled={hintsLeft <= 0}><Icon name="bulb" size={16} /> คำแนะนำ ({hintsLeft})</button>
          <button className="btn btn-ghost btn-sm" onClick={exit}><Icon name="x" size={16} /> ออก</button>
        </div>
      </div>
      <div className="scenes">
        <div className="scene"><Scene variant={1} /></div>
        <div className="scene" onClick={() => { if (phase === 'playing') g.current.wrong += 1; }}>
          <Scene variant={2} />
          {DIFF_SPOTS.map((sp) => {
            const isFound = foundIds.includes(sp.id);
            const hinting = hintSpot === sp.id;
            const ring = isFound ? '#1E8F5E' : hinting ? '#B4690E' : 'transparent';
            const bg = isFound ? 'rgba(30,143,94,0.85)' : hinting ? 'rgba(180,105,14,0.55)' : 'transparent';
            // unfound spots stay out of tab order and the a11y tree, or focus would reveal the answer
            const a11y = isFound ? { 'aria-label': `พบแล้ว จุดที่ ${sp.id}` } : { tabIndex: -1, 'aria-hidden': true as const };
            return (
              <button
                key={sp.id}
                className="spot"
                style={{ left: `${sp.x}%`, top: `${sp.y}%`, borderColor: ring, background: bg }}
                onClick={(e) => { e.stopPropagation(); click(sp.id); }}
                {...a11y}
              >
                {isFound && <Icon name="check" size={20} color="#fff" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="h2">คะแนน: {score}</div>
        <div>พบแล้ว {found}/5</div>
        <div className="dots-row">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="dot" style={{ background: i < found ? 'var(--c-accent)' : 'var(--c-border)' }} />)}
        </div>
      </div>
      {saveError && <div className="muted" role="alert">{saveError}</div>}
      {phase === 'done' && (
        <div className="win-overlay">
          <div className="win-modal glass" role="dialog" aria-modal="true" aria-labelledby="win-title">
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--c-accent)' }}><Icon name="trophy" size={44} /></div>
            <div className="h1" id="win-title">เยี่ยมมาก!</div>
            <div className="h2">คะแนนของคุณ: {score}</div>
            <button className="btn btn-primary" onClick={() => void start()}>เล่นอีกครั้ง</button>
            <button className="btn btn-ghost" onClick={exit}>กลับไปเลือกเกม</button>
          </div>
        </div>
      )}
    </>
  );
}
