'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function ReportIndex() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    api.patients().then((l) => (l[0] ? router.replace(`/doctor/report/${l[0].id}`) : setEmpty(true))).catch(() => undefined);
  }, [router]);
  return empty ? <div className="muted">ไม่มีผู้ป่วยในความดูแล</div> : null;
}
