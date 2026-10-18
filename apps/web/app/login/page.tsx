'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Role } from '@cognicare/shared';
import { Icon } from '../../components/Icon';
import { ApiError } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';

type LoginRole = 'patient' | 'doctor';
const ALLOWED: Record<LoginRole, Role[]> = { patient: ['patient'], doctor: ['doctor', 'caregiver'] };

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, login } = useAuth();
  const [role, setRole] = useState<LoginRole>(params.get('role') === 'doctor' ? 'doctor' : 'patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pwVisible, setPwVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user.role));
  }, [loading, user, router]);

  const roleLabel = role === 'doctor' ? 'แพทย์' : 'ผู้ป่วย';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน'); return; }
    setBusy(true);
    setError('');
    try {
      const u = await login(email.trim(), password, ALLOWED[role]);
      router.replace(homeFor(u.role));
    } catch (err) {
      if (err instanceof ApiError) setError(err.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : err.status === 429 ? 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' : err.message);
      else setError(`บัญชีนี้ไม่ใช่บัญชี${roleLabel} กรุณาเลือกบทบาทให้ถูกต้อง`);
    } finally {
      setBusy(false);
    }
  }

  const pick = (r: LoginRole) => { setRole(r); setError(''); };

  return (
    <div className="login-wrap">
      <form className="login-card glass" onSubmit={submit} noValidate>
        <button type="button" className="login-back" onClick={() => router.push('/')}><Icon name="chevleft" size={16} /> กลับหน้าแรก</button>
        <div className="brand">
          <div className="brand-mark"><Icon name="brain" size={24} color="#fff" /></div>
          <div className="brand-name">CogniCare</div>
        </div>
        <div className="role-switch" role="tablist" aria-label="เลือกบทบาท">
          <button type="button" role="tab" aria-pressed={role === 'patient'} onClick={() => pick('patient')}><Icon name="smile" size={18} /> ผู้ป่วย</button>
          <button type="button" role="tab" aria-pressed={role === 'doctor'} onClick={() => pick('doctor')}><Icon name="pulse" size={18} /> แพทย์</button>
        </div>
        {error && <div className="login-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
        <div>
          <label className="field-label" htmlFor="login-email">อีเมล</label>
          <input id="login-email" className="input" type="email" autoComplete="username" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="login-password">รหัสผ่าน</label>
          <div className="pw-wrap">
            <input id="login-password" className="input" style={{ paddingRight: 46 }} type={pwVisible ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="pw-toggle" onClick={() => setPwVisible((v) => !v)} aria-label={pwVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
              <Icon name={pwVisible ? 'eyeoff' : 'eye'} size={18} />
            </button>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>เข้าสู่ระบบในบทบาท{roleLabel}</button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
