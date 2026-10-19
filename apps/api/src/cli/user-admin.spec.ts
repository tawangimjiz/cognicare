import * as bcrypt from 'bcryptjs';
import { CliError, createUser, generatePassword, linkUsers, parseArgs, resolvePassword, validateCreate } from './user-admin';

const mkDb = (users: Record<string, any> = {}) => ({
  user: {
    findUnique: jest.fn(async ({ where }: any) => users[where.email] ?? null),
    create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
  },
  patientProfile: { update: jest.fn() },
  caregiverLink: { upsert: jest.fn() },
});
const none = () => Promise.reject(new Error('should not prompt'));

describe('parseArgs', () => {
  it('parses flags', () => {
    expect(parseArgs('create', ['--email', 'a@b.co', '--generate'])).toEqual({ email: 'a@b.co', generate: true });
  });
  it.each([
    [['--password', 'x'], /never accepted/],
    [['--bogus', 'x'], /Unknown argument/],
    [['stray'], /Unknown argument/],
    [['--email'], /Missing value/],
    [['--email', '--name'], /Missing value/],
  ])('rejects %j', (argv, re) => expect(() => parseArgs('create', argv as string[])).toThrow(re));
  it('rejects unknown command', () => expect(() => parseArgs('nope', [])).toThrow(CliError));
});

describe('validateCreate', () => {
  const ok = { email: ' Dr@Example.COM ', name: ' Dr X ', role: 'doctor' };
  it('normalises', () => expect(validateCreate(ok)).toMatchObject({ email: 'dr@example.com', fullName: 'Dr X', role: 'doctor', generate: false }));
  it.each([{ ...ok, email: 'nope' }, { ...ok, role: 'admin' }, { ...ok, language: 'thai' }, { ...ok, name: undefined }, { ...ok, email: undefined }])(
    'rejects %j', (a) => expect(() => validateCreate(a as any)).toThrow(CliError));
  it('accepts language', () => expect(validateCreate({ ...ok, language: 'en' }).language).toBe('en'));
});

describe('resolvePassword', () => {
  it('env wins and is length-checked', async () => {
    expect(await resolvePassword(false, { CREATE_USER_PASSWORD: 'longenough' }, false, none)).toEqual({ password: 'longenough', generated: false });
    await expect(resolvePassword(false, { CREATE_USER_PASSWORD: 'short' }, true, none)).rejects.toThrow(/at least 8/);
    await expect(resolvePassword(true, { CREATE_USER_PASSWORD: 'longenough' }, true, none)).rejects.toThrow(/not both/);
  });
  it('generates 20 chars', async () => {
    const r = await resolvePassword(true, {}, false, none);
    expect(r.generated).toBe(true);
    expect(r.password).toHaveLength(20);
    expect(generatePassword()).not.toBe(r.password);
  });
  it('prompts on TTY, else fails', async () => {
    expect((await resolvePassword(false, {}, true, async () => 'typed-pass')).password).toBe('typed-pass');
    await expect(resolvePassword(false, {}, true, async () => 'x')).rejects.toThrow(/at least 8/);
    await expect(resolvePassword(false, {}, false, none)).rejects.toThrow(/No password source/);
  });
});

describe('createUser', () => {
  const v = (role: string) => validateCreate({ email: 'U@x.co', name: 'U', role });
  it('hashes and creates patient profile only for patients', async () => {
    const db = mkDb();
    await createUser(db, v('patient'), 'password123');
    const { data } = db.user.create.mock.calls[0][0];
    expect(data.patientProfile).toEqual({ create: {} });
    expect(data.email).toBe('u@x.co');
    expect(await bcrypt.compare('password123', data.passwordHash)).toBe(true);
    await createUser(db, v('doctor'), 'password123');
    expect(db.user.create.mock.calls[1][0].data.patientProfile).toBeUndefined();
  });
  it('refuses duplicates without writing', async () => {
    const db = mkDb({ 'u@x.co': { id: '1' } });
    await expect(createUser(db, v('doctor'), 'password123')).rejects.toThrow(/already registered/);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('maps a racing unique-constraint violation to a clean error', async () => {
    const db = mkDb();
    db.user.create.mockRejectedValueOnce(Object.assign(new Error('raw'), { code: 'P2002' }));
    await expect(createUser(db, v('doctor'), 'password123')).rejects.toThrow(CliError);
  });
});

describe('linkUsers', () => {
  const users = {
    'p@x.co': { id: 'p', role: 'patient', email: 'p@x.co' },
    'c@x.co': { id: 'c', role: 'caregiver', email: 'c@x.co' },
    'd@x.co': { id: 'd', role: 'doctor', email: 'd@x.co' },
  };
  it('upserts caregiver link and sets doctor', async () => {
    const db = mkDb(users);
    const out = await linkUsers(db, { patient: 'P@x.co', caregiver: 'c@x.co', doctor: 'd@x.co', relationship: 'son' });
    expect(out).toHaveLength(2);
    expect(db.caregiverLink.upsert.mock.calls[0][0]).toMatchObject({ create: { caregiverId: 'c', patientId: 'p', relationship: 'son' }, update: { relationship: 'son' } });
    expect(db.patientProfile.update).toHaveBeenCalledWith({ where: { patientId: 'p' }, data: { assignedDoctorId: 'd' } });
  });
  it('does not overwrite relationship when omitted', async () => {
    const db = mkDb(users);
    await linkUsers(db, { patient: 'p@x.co', caregiver: 'c@x.co' });
    expect(db.caregiverLink.upsert.mock.calls[0][0].update).toEqual({});
  });
  it.each([
    [{ patient: 'p@x.co' }, /--caregiver and\/or/],
    [{ patient: 'zz@x.co', doctor: 'd@x.co' }, /No user/],
    [{ patient: 'c@x.co', doctor: 'd@x.co' }, /expected patient/],
    [{ patient: 'p@x.co', doctor: 'c@x.co' }, /expected doctor/],
    [{ caregiver: 'c@x.co' }, /--patient is required/],
  ])('rejects %j', async (a, re) => {
    const db = mkDb(users);
    await expect(linkUsers(db, a as any)).rejects.toThrow(re);
    expect(db.patientProfile.update).not.toHaveBeenCalled();
  });
});
