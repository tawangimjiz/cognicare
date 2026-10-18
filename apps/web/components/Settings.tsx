'use client';
import type { AccessibilitySettings } from '@cognicare/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const DEFAULTS: AccessibilitySettings = { notif: true, sound: true, largeText: false };
const ROWS: [string, keyof AccessibilitySettings][] = [
  ['แจ้งเตือน', 'notif'],
  ['เสียงในเกม', 'sound'],
  ['ตัวอักษรขนาดใหญ่', 'largeText'],
];

export function Settings() {
  const { user, setUser } = useAuth();
  if (!user) return null;
  const cur = { ...DEFAULTS, ...user.settings };

  async function toggle(key: keyof AccessibilitySettings) {
    const prev = user!;
    const next = { ...cur, [key]: !cur[key] };
    setUser({ ...prev, settings: next }); // optimistic; applies --font-scale immediately
    // API only accepts PATCH /users/me/settings for patients; other roles stay session-local
    if (prev.role !== 'patient') return;
    try { setUser(await api.updateSettings({ [key]: next[key] })); } catch { setUser(prev); }
  }

  return (
    <>
      <div className="h1">การตั้งค่า</div>
      <div className="card" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ROWS.map(([label, key]) => (
          <div className="settings-row" key={key}>
            <div>{label}</div>
            <button className="switch" role="switch" aria-checked={cur[key]} aria-label={label} onClick={() => toggle(key)}>
              <span className="switch-knob" />
            </button>
          </div>
        ))}
        <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>การเปิด &quot;ตัวอักษรขนาดใหญ่&quot; จะเพิ่มขนาดตัวอักษรทั่วทั้งแอปเพื่อให้อ่านง่ายขึ้น</div>
      </div>
    </>
  );
}
