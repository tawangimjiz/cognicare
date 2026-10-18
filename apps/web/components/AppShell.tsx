'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Role } from '@cognicare/shared';
import { api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { Icon } from './Icon';

interface Nav { icon: string; label: string; href: string; match: (p: string) => boolean }

const PATIENT_NAV: Nav[] = [
  { icon: 'home', label: 'หน้าหลัก', href: '/patient', match: (p) => p === '/patient' },
  { icon: 'gamepad', label: 'เล่นเกม', href: '/patient/games', match: (p) => p.startsWith('/patient/games') },
  { icon: 'trophy', label: 'รางวัล', href: '/patient/rewards', match: (p) => p.startsWith('/patient/rewards') },
  { icon: 'settings', label: 'ตั้งค่า', href: '/patient/settings', match: (p) => p.startsWith('/patient/settings') },
];
const DOCTOR_NAV: Nav[] = [
  { icon: 'home', label: 'ภาพรวม', href: '/doctor', match: (p) => p === '/doctor' },
  { icon: 'barchart', label: 'รายงาน', href: '/doctor/report', match: (p) => p.startsWith('/doctor/report') },
  { icon: 'bell', label: 'แจ้งเตือน', href: '/doctor/alerts', match: (p) => p.startsWith('/doctor/alerts') },
  { icon: 'settings', label: 'ตั้งค่า', href: '/doctor/settings', match: (p) => p.startsWith('/doctor/settings') },
];
const ROLE_LABEL: Record<Role, string> = { patient: 'ผู้ป่วย', doctor: 'แพทย์', caregiver: 'ผู้ดูแล' };

export function AppShell({ group, children }: { group: 'patient' | 'doctor'; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isDoctor = group === 'doctor';
  const [alertCount, setAlertCount] = useState(isDoctor ? 0 : 1);
  const leaving = useRef(false); // logout goes to the landing page, not /login

  const allowed = !!user && (isDoctor ? user.role !== 'patient' : user.role === 'patient');

  useEffect(() => {
    if (loading || leaving.current) return;
    if (!user) router.replace('/login');
    else if (!allowed) router.replace(homeFor(user.role));
  }, [loading, user, allowed, router]);

  useEffect(() => {
    if (isDoctor && allowed) api.alerts().then((r) => setAlertCount(r.alerts.length)).catch(() => undefined);
  }, [isDoctor, allowed, pathname]);

  if (loading || !user || !allowed) return null;

  const nav = isDoctor ? DOCTOR_NAV : PATIENT_NAV;
  const go = (href: string) => router.push(href);
  const doLogout = async () => { leaving.current = true; await logout(); router.replace('/'); };
  const initial = user.fullName.replace(/^(คุณ|นพ\.|พญ\.)\s*/, '').charAt(0) || (isDoctor ? 'พ' : 'ส');

  return (
    <>
      <header className="dock app-dock">
        <div className="app-bar glass glass-bar">
          <div className="brand"><div className="brand-mark"><Icon name="brain" size={20} color="#fff" /></div><div className="brand-name">CogniCare</div></div>
          <nav className="topnav" aria-label="เมนูหลัก">
            {nav.map((n) => (
              <button key={n.href} onClick={() => go(n.href)} aria-current={n.match(pathname) ? 'page' : undefined}>
                <Icon name={n.icon} size={16} /> {n.label}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <div className="role-chip"><Icon name={isDoctor ? 'pulse' : 'smile'} size={16} /> {ROLE_LABEL[user.role]}</div>
            <button className="btn btn-outline btn-sm logout-btn" onClick={doLogout} aria-label="ออกจากระบบ" title="ออกจากระบบ">
              <Icon name="logout" size={16} /><span className="btn-label">ออกจากระบบ</span>
            </button>
            <button className="icon-btn" onClick={() => isDoctor && go('/doctor/alerts')} aria-label="การแจ้งเตือน">
              <Icon name="bell" size={20} />
              {alertCount > 0 && <span className="alert-dot">{alertCount}</span>}
            </button>
            <div className="avatar" aria-hidden="true">{initial}</div>
          </div>
        </div>
      </header>
      <main className="content"><div className="content-inner">{children}</div></main>
      <nav className="dock dock-bottom app-dock tabbar-dock" aria-label="เมนูหลัก">
        <div className="tabbar glass">
          {nav.map((n) => (
            <button key={n.href} onClick={() => go(n.href)} aria-current={n.match(pathname) ? 'page' : undefined}>
              <Icon name={n.icon} size={22} /><span>{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
