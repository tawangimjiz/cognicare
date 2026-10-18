'use client';
import { GAMES, STATUS_META, type ActivityDto, type AlertDto, type PatientStatus } from '@cognicare/shared';
import { relativeDay } from '../../lib/format';
import { Icon } from '../Icon';

const KIND_META: Record<AlertDto['kind'], PatientStatus> = { declining: 'watch', inactive: 'stable', improving: 'improving' };

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${Math.max(m, 1)} นาทีที่แล้ว`;
  if (m < 1440) return `${Math.floor(m / 60)} ชั่วโมงที่แล้ว`;
  return relativeDay(iso);
}

export function activityText(a: ActivityDto): string {
  const g = GAMES.find((x) => x.id === a.gameId)?.name ?? a.gameId;
  return `${a.patientName} เล่น "${g}" ได้คะแนน ${Math.round(a.score)} — ${relativeDay(a.at)}`;
}

export function AlertCards({ alerts, compact }: { alerts: AlertDto[]; compact: boolean }) {
  return (
    <>
      {alerts.map((al) => {
        const meta = STATUS_META[KIND_META[al.kind]];
        return (
          <div key={al.id} className="alert-card" style={{ background: al.critical ? 'var(--c-danger-bg)' : 'var(--c-subtle)', borderLeft: `4px solid ${al.critical ? meta.color : 'transparent'}` }}>
            <div className="alert-icon" style={{ background: meta.color + '1f', color: meta.color }}><Icon name={meta.icon} size={18} color={meta.color} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {al.patientName}
                {al.critical && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-danger)', display: 'inline-block', animation: 'pulseDot 2s infinite' }} />}
              </div>
              <div style={{ fontSize: '0.9rem', marginTop: 2 }}>{al.text}</div>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{ago(al.at)}</div>
              {compact && <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }}>ดูรายละเอียด</button>}
            </div>
            {!compact && <button className="btn btn-outline btn-sm" style={{ alignSelf: 'center' }}>ดูรายละเอียด</button>}
          </div>
        );
      })}
    </>
  );
}
