import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, LoginBody, RegisterBody } from '@cognicare/shared';
import * as bcrypt from 'bcryptjs';
import { hashPassword, normalizeEmail } from './credentials';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async register(body: RegisterBody): Promise<AuthResponse> {
    const email = normalizeEmail(body.email);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email,
        role: body.role,
        fullName: body.fullName.trim(),
        passwordHash: await hashPassword(body.password),
        ...(body.role === 'patient' ? { patientProfile: { create: {} } } : {}),
      },
      include: { patientProfile: true },
    });
    return this.issue(user);
  }

  async login(body: LoginBody): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(body.email) },
      include: { patientProfile: true },
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user);
  }

  async logout(jti: string): Promise<void> {
    await this.redis.client.del(`sess:${jti}`);
  }

  private async issue(user: Parameters<UsersService['toDto']>[0]): Promise<AuthResponse> {
    const jti = randomUUID();
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, jti });
    const { exp, iat } = this.jwt.decode(accessToken) as { exp: number; iat: number };
    await this.redis.client.set(`sess:${jti}`, user.id, 'EX', exp - iat);
    return { accessToken, user: this.users.toDto(user) };
  }
}
