'use client';
import { STATUS_META, type PatientSummary } from '@cognicare/shared';
import { relativeDay } from '../../lib/format';
import { Icon } from '../Icon';
import { Sparkline } from '../charts';

export const FILTERS = [{ key: 'all', label: 'ทั้งหมด' }, { key: 'improving', label: 'กำลังดีขึ้น' }, { key: 'watch', label: 'ต้องติดตาม' }] as const;
export type Filter = (typeof FILTERS)[number]['key'];

export function PatientList({ patients, selectedId, search, filter, onSearch, onFilter, onSelect }: {
  patients: PatientSummary[]; selectedId: string | undefined; search: string; filter: Filter;
  onSearch(v: string): void; onFilter(f: Filter): void; onSelect(id: string): void;
}) {
  const q = search.trim();
  const list = patients.filter((p) => (filter === 'all' || p.status === filter) && (!q || p.fullName.includes(q)));
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <input className="input" style={{ paddingLeft: 42, borderRadius: 999 }} placeholder="ค้นหาผู้ป่วย..." aria-label="ค้นหาผู้ป่วย" value={search} onChange={(e) => onSearch(e.target.value)} />
        <span style={{ position: 'absolute', left: 14, top: 14, color: 'var(--c-muted)' }}><Icon name="search" size={18} /></span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => <button key={f.key} className="filter-chip" aria-pressed={filter === f.key} onClick={() => onFilter(f.key)}>{f.label}</button>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }}>
        {list.map((p) => {
          const meta = STATUS_META[p.status];
          return (
            <button key={p.id} className="patient-row" aria-current={selectedId === p.id ? 'true' : undefined} onClick={() => onSelect(p.id)}>
              <div className="avatar" style={{ background: 'var(--c-primary)' }}>{p.fullName.replace('คุณ', '').charAt(0)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>{p.fullName}<span className="status-dot" style={{ background: meta.color }} /></div>
                <div className="muted" style={{ fontSize: '0.82rem' }}>{p.age ?? '-'} ปี · {meta.label} · {p.lastSessionAt ? relativeDay(p.lastSessionAt) : 'ยังไม่มี session'}</div>
              </div>
              <Sparkline points={p.sparkline} color={meta.color} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
