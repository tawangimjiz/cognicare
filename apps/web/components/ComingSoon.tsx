import type { ReactNode } from 'react';

// Port of renderComingSoon. Markup uses the prototype classes (empty-state, icon-lg, h2, muted, btn btn-navy).
export default function ComingSoon({ name, onBack }: { name: string; onBack?: () => void }): ReactNode {
  return (
    <div className="empty-state" style={{ height: '60vh' }}>
      <div className="icon-lg">
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
      <div className="h2">{name} กำลังพัฒนา</div>
      <div className="muted">ตอนนี้ลองเล่น &quot;จับผิดภาพ&quot; ได้เลย</div>
      {onBack && (
        <button type="button" className="btn btn-navy" onClick={onBack}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>{' '}
          กลับไปเลือกเกม
        </button>
      )}
    </div>
  );
}
