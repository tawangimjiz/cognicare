'use client';

import { useEffect, useState } from 'react';
import type { LeaderboardResponse, ProgressResponse } from '@cognicare/shared';
import { Icon } from '../../../components/Icon';
import { api } from '../../../lib/api';
import { badgesFor } from '../../../lib/rewards';

export default function Rewards() {
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [lb, setLb] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.progress('me'), api.leaderboard('spot')])
      .then(([p, l]) => { setProgress(p); setLb(l); })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="muted" role="alert">{error}</div>;
  if (!progress) return <div className="muted" role="status">กำลังโหลด...</div>;

  const badges = badgesFor(progress);
  const stats = [
    { label: 'รางวัลที่ได้รับ', value: `${badges.filter((b) => !b.locked).length} / ${badges.length}` },
    { label: 'วันที่เล่นต่อเนื่อง', value: `${progress.streakDays} วัน` },
    { label: 'เกมที่เล่นสะสม', value: `${progress.totalSessions} ครั้ง` },
  ];

  return (
    <>
      <div className="h1">รางวัลและความสำเร็จ</div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        {stats.map((st) => (
          <div className="card" key={st.label}>
            <div className="stat-label">{st.label}</div>
            <div className="h1" style={{ color: 'var(--c-primary)' }}>{st.value}</div>
          </div>
        ))}
      </div>
      {lb?.me && (
        <div className="card">
          <div className="stat-label">อันดับของคุณในเกมจับผิดภาพ</div>
          <div className="h1" style={{ color: 'var(--c-primary)' }}>อันดับ {lb.me.rank} ({Math.round(lb.me.score)} คะแนน)</div>
        </div>
      )}
      <div className="badge-grid">
        {badges.map((b) => {
          const op = b.locked ? 0.4 : 1;
          return (
            <div className="badge-card" key={b.label}>
              {b.locked && <div className="badge-lock"><Icon name="lock" size={14} /></div>}
              <div className="badge-icon-wrap" style={{ background: b.locked ? 'var(--c-subtle)' : 'var(--c-primary-light)', opacity: op }}>
                <Icon name={b.icon} size={26} color={b.locked ? 'var(--c-muted)' : 'var(--c-primary)'} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', opacity: op }}>{b.label}</div>
              <div className="muted" style={{ fontSize: '0.75rem', opacity: op }}>{b.desc}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
