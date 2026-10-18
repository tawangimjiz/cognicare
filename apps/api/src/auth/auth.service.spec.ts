import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma: any = { user: { findUnique: jest.fn(), create: jest.fn() } };
  const redis: any = { client: { set: jest.fn(), del: jest.fn() } };
  const jwt = new JwtService({ secret: 's', signOptions: { expiresIn: '8h' } });
  const users = { toDto: (u: any) => ({ id: u.id, role: u.role }) } as unknown as UsersService;
  const svc = new AuthService(prisma, redis, jwt, users);

  beforeEach(() => jest.clearAllMocks());

  it('register hashes the password and stores jti in redis', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', role: data.role, passwordHash: data.passwordHash }));
    const res = await svc.register({ email: 'A@x.com', password: 'password123', fullName: 'A', role: 'patient' });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('a@x.com');
    expect(data.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', data.passwordHash)).toBe(true);
    expect(data.patientProfile).toEqual({ create: {} });
    const { jti, sub } = jwt.decode(res.accessToken) as any;
    expect(sub).toBe('u1');
    expect(redis.client.set).toHaveBeenCalledWith(`sess:${jti}`, 'u1', 'EX', 8 * 3600);
  });

  it('register rejects duplicate email with 409', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'x' });
    await expect(svc.register({ email: 'a@x.com', password: 'password123', fullName: 'A', role: 'caregiver' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('login rejects unknown user and bad password with 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.login({ email: 'a@x.com', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'doctor', passwordHash: await bcrypt.hash('right-pass', 4) });
    await expect(svc.login({ email: 'a@x.com', password: 'wrong-pass' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it('login succeeds and stores session', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'doctor', passwordHash: await bcrypt.hash('right-pass', 4) });
    const res = await svc.login({ email: 'a@x.com', password: 'right-pass' });
    expect(res.accessToken).toBeTruthy();
    expect(redis.client.set).toHaveBeenCalledTimes(1);
  });

  it('logout removes the session key', async () => {
    await svc.logout('j1');
    expect(redis.client.del).toHaveBeenCalledWith('sess:j1');
  });
});
