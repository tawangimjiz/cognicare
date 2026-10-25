import type { DomainKey, GameSlug, PatientStatus } from './api-types';

export interface DomainDef { key: DomainKey; th: string; color: string; icon: string }
export interface GameDef { id: GameSlug; name: string; domainIdx: number; icon: string; ready: boolean; ai: boolean }
export interface StatusMeta { color: string; bg: string; icon: string; label: string }

/** Order matters: DB domain_id = index + 1. */
export const DOMAINS: DomainDef[] = [
  { key: 'focus', th: 'สมาธิ', color: '#1A56DB', icon: 'target' },
  { key: 'speed', th: 'ความเร็วคิด', color: '#0E7490', icon: 'bolt' },
  { key: 'direction', th: 'ทิศทาง', color: '#B45309', icon: 'compass' },
  { key: 'language', th: 'ภาษา', color: '#7C3AED', icon: 'message' },
  { key: 'memory', th: 'ความจำ', color: '#0F766E', icon: 'brain' },
  { key: 'mood', th: 'อารมณ์', color: '#BE185D', icon: 'smile' },
];

export const GAMES: GameDef[] = [
  { id: 'spot', name: 'จับผิดภาพ', domainIdx: 4, icon: 'brain', ready: true, ai: true },
  { id: 'oneback', name: 'One Back Task', domainIdx: 0, icon: 'target', ready: true, ai: true },
  { id: 'maze', name: 'เขาวงกต 3D', domainIdx: 2, icon: 'compass', ready: false, ai: false },
];

export const STATUS_META: Record<PatientStatus, StatusMeta> = {
  watch: { color: '#C0392B', bg: '#FDECEA', icon: 'alert', label: 'ต้องติดตาม' },
  improving: { color: '#1E8F5E', bg: '#E9F8F0', icon: 'trendup', label: 'ดีขึ้น' },
  stable: { color: '#B4690E', bg: '#FDF3E4', icon: 'minuscircle', label: 'คงที่' },
  new: { color: '#52697A', bg: '#EEF2F3', icon: 'userplus', label: 'ผู้ป่วยใหม่' },
};

export const DAILY_GOAL = 4;
