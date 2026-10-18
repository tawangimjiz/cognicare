import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { PatientStatus } from '@cognicare/shared';
import { AccessService } from '../users/access.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import { PatientsService } from './patients.service';

const STATUSES = ['watch', 'improving', 'stable', 'new'];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'caregiver')
export class PatientsController {
  constructor(private readonly patients: PatientsService, private readonly access: AccessService) {}

  @Get('patients')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string, @Query('q') q?: string) {
    if (status && !STATUSES.includes(status)) throw new BadRequestException('invalid status');
    return this.patients.list(user, status as PatientStatus | undefined, q);
  }

  @Get('alerts')
  alerts(@CurrentUser() user: AuthUser) {
    return this.patients.alerts(user);
  }

  @Get('report/:userId')
  async report(
    @CurrentUser() user: AuthUser, @Param('userId') userId: string,
    @Query('from') from?: string, @Query('to') to?: string,
  ) {
    const pid = this.access.resolvePatientId(user, userId);
    await this.access.assertCanAccessPatient(user, pid);
    return this.patients.report(pid, from, to);
  }
}
