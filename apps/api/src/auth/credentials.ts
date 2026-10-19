import * as bcrypt from 'bcryptjs';

/** Single source of truth for account rules, shared by AuthService and the admin CLI. */
export const MIN_PASSWORD_LENGTH = 8;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const hashPassword = (password: string) => bcrypt.hash(password, 10);
