'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GAMES, type AlertsResponse, type PatientSummary, type SessionDto } from '@cognicare/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Radar } from '../../components/charts';
import { PatientList, type Filter } from '../../components/doctor/PatientList';
import { AlertCards, activityText } from '../../components/doctor/AlertCards';

function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const pid = useSearchParams().get('p');
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [rows, setRows] = useState<SessionDto[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.patients().then(setPatients).catch(() => setPatients([]));
    api.alerts().then(setAlerts).catch(() => undefined);
  }, []);

  const sel = patients?.find((p) => p.id === pid) ?? patients?.[0];
  const selId = sel?.id;
  const hasHistory = !!sel && sel.status !== 'new';
  useEffect(() => {
    setRows([]);
    if (selId && hasHistory) api.results(selId, 5).then((r) => setRows(r.items)).catch(() => undefined);
  }, [selId, hasHistory]);

  if (!patients) return null;
  const readOnly = user?.role === 'caregiver';
  const watch = patients.filter((p) => p.status === 'watch').length;
  const scored = patients.filter((p) => p.avgScore != null);
  const avg = scored.length ? Math.round(scored.reduce((a, p) => a + (p.avgScore as number), 0) / scored.length) : 0;
  const kpis = [
    { label: 'ผู้ป่วยทั้งหมด', value: `${patients.length} คน`, danger: false, badge: '' },
    { label: 'Session วันนี้', value: `${patients.reduce((a, p) => a + p.sessionsToday, 0)} sessions`, danger: false, badge: '' },
    { label: 'ต้องติดตามด่วน', value: `${watch} คน`, danger: true, badge: 'ด่วน' },
    { label: 'ค่าเฉลี่ยคะแนนรวม', value: `${avg}/100`, danger: false, badge: '' },
  ];

  return (
    <>
      <div className="stat-grid">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className="stat-label">{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="h1" style={{ color: k.danger ? 'var(--c-danger)' : 'var(--c-text)' }}>{k.value}</div>
              {k.badge && <span className="badge-pill" style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger)' }}>{k.badge}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="doctor-grid">
        <PatientList patients={patients} selectedId={selId} search={search} filter={filter}
          onSearch={setSearch} onFilter={setFilter} onSelect={(id) => router.replace(`/doctor?p=${id}`)} />

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sel ? (
            <>
              <div>
                <div className="h2">{sel.fullName}</div>
                <div className="muted" style={{ marginTop: 4 }}>{sel.age ?? '-'} ปี{sel.severity && <> · <span className="badge-pill" style={{ background: 'var(--c-warning-bg)', color: 'var(--c-warning)' }}>{sel.severity}</span></>}</div>
              </div>
              {hasHistory ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Radar baseline={sel.baseline} current={sel.current} /></div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>ประวัติ Session ล่าสุด</div>
                    <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>วันที่</th><th>เกม</th><th>คะแนน</th><th>เวลา</th><th>สถานะ</th></tr></thead>
                        <tbody>
                          {rows.map((s) => {
                            const pass = s.score >= 60;
                            return (
                              <tr key={s.id}>
                                <td>{formatDate(s.startedAt)}</td>
                                <td>{GAMES.find((g) => g.id === s.gameId)?.name ?? s.gameId}</td>
                                <td style={{ fontWeight: 600 }}>{Math.round(s.score)}</td>
                                <td>{Math.max(1, Math.round((s.totalDurationMs ?? 0) / 60000))} นาที</td>
                                <td><span className="status-chip" style={{ background: pass ? 'var(--c-success-bg)' : 'var(--c-warning-bg)', color: pass ? 'var(--c-success)' : 'var(--c-warning)' }}>{pass ? 'ผ่าน' : 'ต้องพัฒนา'}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-navy" style={{ flex: 1 }} onClick={() => router.push(`/doctor/report/${sel.id}`)}>ดูรายงานเต็ม</button>
                    {!readOnly && <button className="btn btn-ghost" style={{ flex: 1 }}>นัดหมาย</button>}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <div className="icon-lg"><Icon name="gamepad" size={52} /></div>
                  <div className="h2">ยังไม่มีข้อมูลการเล่น</div>
                  <div className="muted">ผู้ป่วยรายนี้ยังไม่เคยเริ่มเล่นเกมบำบัด</div>
                  {!readOnly && <button className="btn btn-primary">ส่งคำเชิญเริ่มต้นใช้งาน</button>}
                </div>
              )}
            </>
          ) : <div className="muted">ไม่มีผู้ป่วยในความดูแล</div>}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="bell" size={18} /> การแจ้งเตือน</div>
          <AlertCards alerts={alerts?.alerts ?? []} compact />
          <div className="h2" style={{ marginTop: 6 }}>กิจกรรมล่าสุด</div>
          {(alerts?.activity ?? []).map((a, i) => <div key={i} className="activity-item">{activityText(a)}</div>)}
        </div>
      </div>
    </>
  );
}

export default function DoctorHome() {
  return <Suspense fallback={null}><Home /></Suspense>;
}
