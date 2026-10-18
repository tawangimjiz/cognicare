import type { Role } from '@cognicare/shared';

export interface AuthUser { id: string; role: Role; jti: string }
