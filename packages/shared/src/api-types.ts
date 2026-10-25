export type Role = 'patient' | 'caregiver' | 'doctor';
export type DomainKey = 'focus' | 'speed' | 'direction' | 'language' | 'memory' | 'mood';
export type GameSlug = 'spot' | 'oneback' | 'maze';
export type SessionStatus = 'in_progress' | 'completed' | 'timed_out' | 'out_of_mistakes' | 'abandoned';
export type TrendDirection = 'improving' | 'stable' | 'declining';
export type PatientStatus = 'watch' | 'improving' | 'stable' | 'new';

export interface AccessibilitySettings { notif: boolean; sound: boolean; largeText: boolean }
export interface UserDto { id: string; role: Role; fullName: string; email: string; languagePref: string; settings: AccessibilitySettings | null }
export interface RegisterBody { email: string; password: string /* min 8 */; fullName: string; role: 'patient' | 'caregiver' }
export interface LoginBody { email: string; password: string }
export interface AuthResponse { accessToken: string; user: UserDto }

export interface GameDto { id: GameSlug; name: string; domain: DomainKey; ready: boolean }

/** 1=easy 2=medium 3=hard 4=2-back 5=3-back */
export type Tier = 1 | 2 | 3 | 4 | 5;
export interface StartSessionBody { gameId: GameSlug; tier: Tier }
export interface StartSessionResponse { sessionId: string; startedAt: string }
export interface ScoreInput { domain: DomainKey; rawScore: number; errorRate?: number /*0..1*/; meanReactionTimeMs?: number }
export interface SessionEventInput { type: string; at: string /*ISO*/; reactionTimeMs?: number; data?: Record<string, unknown> }
export interface EndSessionBody { status: Exclude<SessionStatus, 'in_progress'>; totalDurationMs: number; scores: ScoreInput[] /*1..6*/; events?: SessionEventInput[] /*<=500*/; metrics?: Record<string, unknown> /*object, <=32KB, depth<=4*/ }
export interface SessionScoreDto { domain: DomainKey; rawScore: number; normalizedScore: number; errorRate: number | null; meanReactionTimeMs: number | null }
export interface SessionDto { id: string; gameId: GameSlug; tier: number; status: SessionStatus; startedAt: string; endedAt: string | null; totalDurationMs: number | null; score: number /*mean normalized, 0 if none*/; scores: SessionScoreDto[] }
export interface ResultsResponse { items: SessionDto[] }

export interface DomainProgress { domain: DomainKey; current: number /*avg last 7d*/; baseline: number /*avg first 7d of history*/; changePct: number; series: number[] /*30 daily values, carry-forward*/; trend: TrendDirection | null }
export interface ProgressResponse {
  patientId: string; status: PatientStatus;
  domains: DomainProgress[];            // 6 items, DOMAINS order
  sparkline: number[];                  // 7 weekly overall averages, oldest first
  today: { score: number; scoreChangePct: number | null; minutes: number; games: number };
  streakDays: number; totalSessions: number;
  best: DomainKey | null; weakest: DomainKey | null; lastSessionAt: string | null;
}
export interface PatientSummary {
  id: string; fullName: string; age: number | null; severity: string | null; status: PatientStatus;
  lastSessionAt: string | null; sessionsToday: number; avgScore: number | null;
  sparkline: number[]; baseline: number[] /*6*/; current: number[] /*6*/;
}
export interface AlertDto { id: string; patientId: string; patientName: string; kind: 'declining' | 'inactive' | 'improving'; critical: boolean; text: string; at: string }
export interface ActivityDto { patientName: string; gameId: GameSlug; score: number; at: string }
export interface AlertsResponse { alerts: AlertDto[]; activity: ActivityDto[] /*latest 10 completed sessions*/ }
export interface ReportResponse { patient: PatientSummary; from: string; to: string; progress: ProgressResponse; sessions: SessionDto[] }
export interface LeaderboardResponse { gameId: GameSlug; top: { rank: number; score: number; isMe: boolean }[]; me: { rank: number; score: number } | null }
export interface ApiError { statusCode: number; message: string | string[]; error?: string }
