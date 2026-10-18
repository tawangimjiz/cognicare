import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessibilitySettings, UserDto } from '@cognicare/shared';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';

const DEFAULT_SETTINGS: AccessibilitySettings = { notif: true, sound: true, largeText: false };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UserRow = {
  id: string; role: UserDto['role']; fullName: string; email: string; languagePref: string;
  patientProfile?: { accessibilitySettings: unknown } | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  toDto(u: UserRow): UserDto {
    const s = u.patientProfile?.accessibilitySettings;
    return {
      id: u.id, role: u.role, fullName: u.fullName, email: u.email, languagePref: u.languagePref,
      settings: u.patientProfile ? { ...DEFAULT_SETTINGS, ...(s as Partial<AccessibilitySettings>) } : null,
    };
  }

  async getById(id: string): Promise<UserDto> {
    const u = UUID.test(id)
      ? await this.prisma.user.findUnique({ where: { id }, include: { patientProfile: true } })
      : null;
    if (!u) throw new NotFoundException('User not found');
    return this.toDto(u);
  }

  /** GET /users/:id: self, or a patient the caller may access. */
  async getForUser(caller: AuthUser, param: string): Promise<UserDto> {
    const id = this.access.resolvePatientId(caller, param);
    const dto = await this.getById(id);
    if (id !== caller.id && !(await this.access.canAccessPatient(caller, id))) throw new ForbiddenException();
    return dto;
  }

  async updateSettings(userId: string, patch: Partial<AccessibilitySettings>): Promise<UserDto> {
    const profile = await this.prisma.patientProfile.findUnique({ where: { patientId: userId } });
    if (!profile) throw new NotFoundException('Patient profile not found');
    const merged = { ...DEFAULT_SETTINGS, ...(profile.accessibilitySettings as object), ...patch };
    await this.prisma.patientProfile.update({ where: { patientId: userId }, data: { accessibilitySettings: merged } });
    return this.getById(userId);
  }
}
