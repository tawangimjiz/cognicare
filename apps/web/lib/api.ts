import type {
  ActivityDto, AlertsResponse, AuthResponse, EndSessionBody, GameDto, GameSlug, LeaderboardResponse, LoginBody,
  PatientSummary, PatientStatus, ProgressResponse, RegisterBody, ReportResponse, ResultsResponse, SessionDto,
  StartSessionBody, StartSessionResponse, UserDto, AccessibilitySettings,
} from '@cognicare/shared';

export type { ActivityDto };

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'cognicare.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ponytail: token in localStorage is XSS-exposed; move to an httpOnly cookie via a Next route handler before production
export const tokenStore = {
  get: (): string | null => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

async function req<T>(method: string, path: string, body?: unknown, opts: { noRedirect?: boolean } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !opts.noRedirect) {
      tokenStore.clear();
      if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) location.assign('/login');
    }
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(', ') : m ?? res.statusText);
  }
  return data as T;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const api = {
  login: (b: LoginBody) => req<AuthResponse>('POST', '/auth/login', b, { noRedirect: true }),
  register: (b: RegisterBody) => req<AuthResponse>('POST', '/auth/register', b, { noRedirect: true }),
  logout: () => req<void>('POST', '/auth/logout', undefined, { noRedirect: true }),
  me: () => req<UserDto>('GET', '/auth/me'),
  user: (id: string) => req<UserDto>('GET', `/users/${id}`),
  updateSettings: (s: Partial<AccessibilitySettings>) => req<UserDto>('PATCH', '/users/me/settings', s),
  games: () => req<GameDto[]>('GET', '/games'),
  startSession: (b: StartSessionBody) => req<StartSessionResponse>('POST', '/sessions', b),
  endSession: (id: string, b: EndSessionBody) => req<SessionDto>('PUT', `/sessions/${id}`, b),
  results: (userId: string, limit = 20) => req<ResultsResponse>('GET', `/results/${userId}${qs({ limit })}`),
  progress: (userId: string) => req<ProgressResponse>('GET', `/progress/${userId}`),
  patients: (f: { status?: PatientStatus; q?: string } = {}) => req<PatientSummary[]>('GET', `/patients${qs(f)}`),
  alerts: () => req<AlertsResponse>('GET', '/alerts'),
  report: (userId: string, f: { from?: string; to?: string } = {}) => req<ReportResponse>('GET', `/report/${userId}${qs(f)}`),
  leaderboard: (gameId: GameSlug) => req<LeaderboardResponse>('GET', `/leaderboard/${gameId}`),
};
