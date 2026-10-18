'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DAILY_GOAL, DOMAINS, GAMES } from '@cognicare/shared';
import type { GameDto, ProgressResponse, SessionDto } from '@cognicare/shared';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { relativeDay } from '../../lib/format';

const domainTh = (k: string | null) => DOMAINS.find((d) => d.key === k);

export default function PatientHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [recent, setRecent] = useState<SessionDto[]>([]);
  const [games, setGames] = useState<GameDto[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.progress('me'), api.results('me', 3), api.games()])
      .then(([p, r, g]) => { setProgress(p); setRecent(r.items); setGames(g); })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="muted" role="alert">{error}</div>;
  if (!progress) return <div className="muted" role="status">กำลังโหลด...</div>;

  const t = progress.today;
  const pct = Math.min(100, Math.round((t.games / DAILY_GOAL) * 100));
  const best = domainTh(progress.best);
  const weakest = domainTh(progress.weakest);
  const quickStats = [
    { label: 'คะแนนรวมวันนี้', value: String(Math.round(t.score)), trend: t.scoreChangePct != null && t.scoreChangePct > 0 ? `${Math.round(t.scoreChangePct)}%` : null, icon: undefined as string | undefined },
    { label: 'เวลาฝึกสมองรวม', value: `${t.minutes} นาที`, trend: null, icon: undefined },
    { label: 'ด้านที่ดีที่สุด', value: best?.th ?? '-', trend: null, icon: 'brain' },
    { label: 'ด้านที่ต้องฝึกเพิ่ม', value: weakest?.th ?? '-', trend: null, icon: 'alert' },
  ];
  const ready = (id: string) => games.find((g) => g.id === id)?.ready ?? false;

  return (
    <>
      <div className="hero">
        <div><div className="hero-title">สวัสดีตอนเช้าครับ {user?.fullName}</div></div>
        <div>
          <div style={{ marginBottom: 8 }}>เป้าหมายวันนี้: {t.games} / {DAILY_GOAL} เกม</div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      <div className="stat-grid">
        {quickStats.map((st) => (
          <div className="card" key={st.label}>
            <div className="stat-label">{st.label}</div>
            <div className="stat-value">{st.value}{st.icon && <> <Icon name={st.icon} size={18} color="var(--c-muted)" /></>}</div>
            {st.trend && <div className="stat-trend"><Icon name="trendup" size={14} /> {st.trend}</div>}
          </div>
        ))}
      </div>
      <div>
        <div className="h2" style={{ marginBottom: 14 }}>แนะนำสำหรับคุณวันนี้</div>
        <div className="game-grid">
          {GAMES.map((g) => {
            const d = DOMAINS[g.domainIdx];
            return (
              <div className="card game-card" key={g.id}>
                <div className="game-icon"><Icon name={g.icon} size={24} /></div>
                <div className="h2">{g.name}</div>
                <div className="domain-chip"><Icon name={d.icon} size={14} /> {d.th}</div>
                <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => router.push(`/patient/games/${g.id}`)} data-ready={ready(g.id)}>เล่นเลย</button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card">
        <div className="h2" style={{ marginBottom: 14 }}>เกมล่าสุดที่เล่น</div>
        {recent.length === 0 && <div className="muted">ยังไม่มีประวัติการเล่น</div>}
        {recent.map((s) => (
          <div className="session-row" key={s.id}>
            <div>
              <div style={{ fontWeight: 500 }}>{GAMES.find((g) => g.id === s.gameId)?.name ?? s.gameId}</div>
              <div className="muted" style={{ fontSize: '0.88rem' }}>{relativeDay(s.endedAt ?? s.startedAt)}</div>
            </div>
            <div className="score-chip">{Math.round(s.score)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
