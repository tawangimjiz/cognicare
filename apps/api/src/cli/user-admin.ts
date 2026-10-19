/** Pure-ish logic for the admin CLI (prisma/user-admin.ts). Throws CliError for user-facing failures. */
import { randomBytes } from 'crypto';
import { hashPassword, MIN_PASSWORD_LENGTH, normalizeEmail } from '../auth/credentials';

export class CliError extends Error {}

export const ROLES = ['patient', 'caregiver', 'doctor'] as const;
export type CliRole = (typeof ROLES)[number];
type Args = Record<string, string | true>;

const FLAGS: Record<string, { value: string[]; bool: string[] }> = {
  create: { value: ['email', 'name', 'role', 'language'], bool: ['generate'] },
  link: { value: ['caregiver', 'patient', 'doctor', 'relationship'], bool: [] },
};

export function parseArgs(cmd: string, argv: string[]): Args {
  const spec = FLAGS[cmd];
  if (!spec) throw new CliError(`Unknown command "${cmd}" (use create | link)`);
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = /^--([a-z-]+)$/.exec(argv[i])?.[1] ?? '';
    if (!spec.value.includes(key) && !spec.bool.includes(key)) {
      throw new CliError(`Unknown argument "${argv[i]}"${key === 'password' ? ' (passwords are never accepted on the command line)' : ''}`);
    }
    if (spec.bool.includes(key)) { out[key] = true; continue; }
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) throw new CliError(`Missing value for --${key}`);
    out[key] = v;
  }
  return out;
}

const need = (a: Args, k: string) => {
  const v = a[k];
  if (typeof v !== 'string' || !v.trim()) throw new CliError(`--${k} is required`);
  return v.trim();
};

export function validateCreate(a: Args) {
  const email = normalizeEmail(need(a, 'email'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CliError(`Invalid email "${email}"`);
  const role = need(a, 'role') as CliRole;
  if (!ROLES.includes(role)) throw new CliError(`--role must be one of ${ROLES.join(', ')}`);
  const language = typeof a.language === 'string' ? a.language.trim() : undefined;
  if (language !== undefined && !/^[a-z]{2}$/.test(language)) throw new CliError('--language must be a 2-letter code (e.g. th, en)');
  return { email, fullName: need(a, 'name'), role, language, generate: a.generate === true };
}

export const generatePassword = () => randomBytes(15).toString('base64url').slice(0, 20);

export function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD_LENGTH) throw new CliError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  return pw;
}

/** env CREATE_USER_PASSWORD > --generate > hidden TTY prompt > error. */
export async function resolvePassword(generate: boolean, env: NodeJS.ProcessEnv, isTTY: boolean, prompt: () => Promise<string>) {
  if (env.CREATE_USER_PASSWORD) {
    if (generate) throw new CliError('Use either CREATE_USER_PASSWORD or --generate, not both');
    return { password: checkPassword(env.CREATE_USER_PASSWORD), generated: false };
  }
  if (generate) return { password: generatePassword(), generated: true };
  if (!isTTY) throw new CliError('No password source: set CREATE_USER_PASSWORD, pass --generate, or run in an interactive terminal');
  return { password: checkPassword(await prompt()), generated: false };
}

// Minimal structural Prisma surface so tests can mock it.
export interface Db {
  user: { findUnique(a: any): Promise<any>; create(a: any): Promise<any> };
  patientProfile: { update(a: any): Promise<any> };
  caregiverLink: { upsert(a: any): Promise<any> };
}

export async function createUser(db: Db, v: ReturnType<typeof validateCreate>, password: string) {
  const dup = new CliError(`Email already registered: ${v.email}`);
  if (await db.user.findUnique({ where: { email: v.email } })) throw dup;
  // unique(email) is the race backstop: a concurrent insert surfaces as P2002
  return db.user.create({
    data: {
      email: v.email,
      role: v.role,
      fullName: v.fullName,
      passwordHash: await hashPassword(password),
      ...(v.language ? { languagePref: v.language } : {}),
      ...(v.role === 'patient' ? { patientProfile: { create: {} } } : {}),
    },
  }).catch((e: any) => { throw e?.code === 'P2002' ? dup : e; });
}

async function byEmail(db: Db, raw: string, role: CliRole, flag: string) {
  const email = normalizeEmail(raw);
  const u = await db.user.findUnique({ where: { email } });
  if (!u) throw new CliError(`No user with email ${email} (--${flag})`);
  if (u.role !== role) throw new CliError(`${email} is a ${u.role}, expected ${role} (--${flag})`);
  return u;
}

/** --patient plus --caregiver [--relationship] and/or --doctor. Idempotent. */
export async function linkUsers(db: Db, a: Args) {
  const patient = await byEmail(db, need(a, 'patient'), 'patient', 'patient');
  if (a.caregiver === undefined && a.doctor === undefined) throw new CliError('Give --caregiver and/or --doctor');
  const done: string[] = [];
  if (a.caregiver !== undefined) {
    const cg = await byEmail(db, need(a, 'caregiver'), 'caregiver', 'caregiver');
    const relationship = typeof a.relationship === 'string' ? a.relationship.trim() : undefined;
    await db.caregiverLink.upsert({
      where: { caregiverId_patientId: { caregiverId: cg.id, patientId: patient.id } },
      create: { caregiverId: cg.id, patientId: patient.id, relationship },
      update: relationship !== undefined ? { relationship } : {},
    });
    done.push(`caregiver ${cg.email} linked to ${patient.email}`);
  }
  if (a.doctor !== undefined) {
    const doc = await byEmail(db, need(a, 'doctor'), 'doctor', 'doctor');
    await db.patientProfile.update({ where: { patientId: patient.id }, data: { assignedDoctorId: doc.id } });
    done.push(`doctor ${doc.email} assigned to ${patient.email}`);
  }
  return done;
}
