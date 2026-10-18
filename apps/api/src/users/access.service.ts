import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccessPatient(user: AuthUser, patientId: string): Promise<boolean> {
    switch (user.role) {
      case 'patient':
        return user.id === patientId;
      case 'doctor':
        return !!(await this.prisma.patientProfile.findFirst({
          where: { patientId, assignedDoctorId: user.id },
          select: { patientId: true },
        }));
      case 'caregiver':
        return !!(await this.prisma.caregiverLink.findUnique({
          where: { caregiverId_patientId: { caregiverId: user.id, patientId } },
          select: { patientId: true },
        }));
      default:
        return false;
    }
  }

  resolvePatientId(user: AuthUser, param: string): string {
    if (param !== 'me') return param;
    if (user.role !== 'patient') throw new BadRequestException("'me' is only valid for patients");
    return user.id;
  }

  async assertCanAccessPatient(user: AuthUser, patientId: string): Promise<void> {
    if (!(await this.canAccessPatient(user, patientId))) throw new ForbiddenException();
  }
}
