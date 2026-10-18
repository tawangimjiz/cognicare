'use client';
import { useEffect, useState } from 'react';
import { DOMAINS, GAMES, type ReportResponse } from '@cognicare/shared';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Icon } from '../Icon';
import { Sparkline } from '../charts';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const PAGE_SIZE = 10;

export function ReportView({ patientId }: { patientId: string }) {
  const [r, setR] = useState<ReportResponse | null>(null);
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);

  useEffect(() => {
    setR(null); setErr(''); setPage(0);
    api.report(patientId).then(setR).catch((e) => setErr(e.message));
  }, [patientId]);

  if (err) return <div className="muted">{err}</div>;
  if (!r) return null;

  const to = new Date(r.to), from = new Date(r.from);
  const total = Math.max(1, Math.ceil(r.sessions.length / PAGE_SIZE));
  const cur = Math.min(page, total - 1);
  const rows = r.sessions.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const axis = [[10, 0], [155, 7], [300, 15], [445, 22], [560, 29]].map(([x, i]) => {
    const d = new Date(to); d.setDate(d.getDate() - (29 - i)); return { x, label: short(d) };
  });

  return (
    <>
      <style>{`@media print{.app-dock,.no-print{display:none !important;}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="h1">รายงานความก้าวหน้า — {r.patient.fullName}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="badge-pill" style={{ background: '#fff', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
            {short(from)} – {formatDate(to)}
          </div>
          <button className="btn btn-navy no-print" onClick={() => window.print()}><Icon name="download" size={16} /> Export PDF</button>
        </div>
      </div>
      <div className="domain-boxes">
        {r.progress.domains.map((p, i) => {
          const d = DOMAINS[i], ch = Math.round(p.changePct);
          return (
            <div key={d.key} className="card domain-box">
              <div className="muted" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name={d.icon} size={14} color={d.color} /> {d.th}</div>
              <div className="h2" style={{ color: d.color }}>{Math.round(p.current)}</div>
              <div style={{ fontSize: '0.8rem', color: ch >= 0 ? 'var(--c-success)' : 'var(--c-danger)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Icon name={ch >= 0 ? 'trendup' : 'minuscircle'} size={12} /> {Math.abs(ch)}%
              </div>
              <Sparkline points={p.series.slice(-7)} width="100%" height={26} color={d.color} />
            </div>
          );
        })}
      </div>
      <div className="card">
        <div className="h2" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="barchart" size={18} /> แนวโน้ม 30 วันที่ผ่านมา</div>
        <svg width="100%" height="220" viewBox="0 0 600 220" style={{ maxWidth: '100%' }}>
          {[10, 55, 100, 145, 190].map((y) => <line key={y} x1="10" y1={y} x2="590" y2={y} stroke="#F0F4F5" />)}
          {r.progress.domains.map((p, i) => !hidden[DOMAINS[i].th] && p.series.length > 1 && (
            <polyline key={i} fill="none" stroke={DOMAINS[i].color} strokeWidth="2.5"
              points={p.series.map((v, k) => `${(10 + (k / (p.series.length - 1)) * 580).toFixed(1)},${(190 - (v / 100) * 180).toFixed(1)}`).join(' ')} />
          ))}
          {axis.map((a) => <text key={a.x} x={a.x} y="212" fontSize="12" fill="var(--c-muted)">{a.label}</text>)}
        </svg>
        <div className="legend-row" style={{ marginTop: 14, justifyContent: 'center' }}>
          {DOMAINS.map((d) => (
            <button key={d.key} className="legend-chip" data-visible={!hidden[d.th]} onClick={() => setHidden({ ...hidden, [d.th]: !hidden[d.th] })}>
              <span className="dot" style={{ width: 10, height: 10, background: d.color }} />{d.th}
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: 560 }}>
          <thead><tr><th>วันที่</th><th>เกม</th><th>คะแนน</th><th>เวลา</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rows.map((s) => {
              const pass = s.status === 'completed';
              return (
                <tr key={s.id}>
                  <td>{formatDate(s.startedAt)}</td>
                  <td>{GAMES.find((g) => g.id === s.gameId)?.name ?? s.gameId}</td>
                  <td style={{ fontWeight: 600 }}>{Math.round(s.score)}</td>
                  <td>{Math.max(1, Math.round((s.totalDurationMs ?? 0) / 60000))} นาที</td>
                  <td><span className="status-chip" style={{ background: pass ? 'var(--c-success-bg)' : 'var(--c-danger-bg)', color: pass ? 'var(--c-success)' : 'var(--c-danger)' }}>{pass ? 'เสร็จสมบูรณ์' : 'ยังไม่สมบูรณ์'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pagination no-print">
          <button className="page-btn" disabled={cur <= 0} onClick={() => setPage(cur - 1)} aria-label="หน้าก่อนหน้า"><Icon name="chevleft" size={16} /></button>
          <div>หน้า {cur + 1} จาก {total}</div>
          <button className="page-btn" disabled={cur >= total - 1} onClick={() => setPage(cur + 1)} aria-label="หน้าถัดไป"><Icon name="chevright" size={16} /></button>
        </div>
      </div>
    </>
  );
}
