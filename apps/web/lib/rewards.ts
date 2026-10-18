import type { ProgressResponse } from '@cognicare/shared';

export interface Badge { icon: string; label: string; desc: string; locked: boolean; color: string }

// Verbatim from the HTML prototype (computeVM.badges); `locked` is the fallback when no rule applies.
export const BADGES: Badge[] = [
  { icon: 'target', label: 'นักสังเกตการณ์', desc: 'เล่นจับผิดภาพครบ 10 ครั้ง', locked: false, color: '#0F5C73' },
  { icon: 'bolt', label: 'สายฟ้า', desc: 'Reaction time ต่ำกว่า 300ms', locked: false, color: '#0E9F6E' },
  { icon: 'flame', label: 'ต่อเนื่อง 7 วัน', desc: 'เล่นติดต่อกัน 7 วัน', locked: false, color: '#B4690E' },
  { icon: 'brain', label: 'นักจำเลิศ', desc: 'One Back Task ได้ 90%+', locked: false, color: '#1D7A8C' },
  { icon: 'star', label: 'ผู้เริ่มต้น', desc: 'เล่นเกมครั้งแรก', locked: false, color: '#B4690E' },
  { icon: 'leaf', label: 'นักสมาธิ', desc: 'ฝึกสมาธิสะสม 60 นาที', locked: true, color: '#52697A' },
  { icon: 'compass', label: 'นักสำรวจ', desc: 'เล่นเขาวงกตทุก level', locked: true, color: '#52697A' },
  { icon: 'message', label: 'นักภาษา', desc: 'ทายคำจากภาพถูก 50 คำ', locked: true, color: '#52697A' },
  { icon: 'crown', label: 'แชมป์ CogniCare', desc: 'ได้คะแนนรวม 10,000+', locked: true, color: '#52697A' },
];

// Rules computable from /progress; any badge without a rule keeps its HTML `locked` value.
const RULES: Record<string, (p: ProgressResponse) => boolean> = {
  'ผู้เริ่มต้น': (p) => p.totalSessions >= 1,
  'ต่อเนื่อง 7 วัน': (p) => p.streakDays >= 7,
  // ponytail: counts all games, not only spot (progress has no per-game count)
  'นักสังเกตการณ์': (p) => p.totalSessions >= 10,
};

export const badgesFor = (p: ProgressResponse | null): Badge[] =>
  BADGES.map((b) => (p && RULES[b.label] ? { ...b, locked: !RULES[b.label](p) } : b));
