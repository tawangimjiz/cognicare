'use client';
import { useEffect, useState } from 'react';
import type { AlertsResponse } from '@cognicare/shared';
import { api } from '../../../lib/api';
import { AlertCards, activityText } from '../../../components/doctor/AlertCards';
import { Icon } from '../../../components/Icon';

export default function DoctorAlerts() {
  const [d, setD] = useState<AlertsResponse | null>(null);
  useEffect(() => { api.alerts().then(setD).catch(() => undefined); }, []);
  if (!d) return null;
  return (
    <>
      <div className="h1" style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 720 }}><Icon name="bell" size={24} /> การแจ้งเตือน</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
        <AlertCards alerts={d.alerts} compact={false} />
        <div className="h2" style={{ marginTop: 6 }}>กิจกรรมล่าสุด</div>
        {d.activity.map((a, i) => <div key={i} className="card" style={{ padding: '16px 20px' }}>{activityText(a)}</div>)}
      </div>
    </>
  );
}
