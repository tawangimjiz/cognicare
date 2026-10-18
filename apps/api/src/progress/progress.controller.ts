import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AccessService } from '../users/access.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from './progress.service';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService, private readonly access: AccessService) {}

  @Get(':userId')
  async get(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    const pid = this.access.resolvePatientId(user, userId);
    await this.access.assertCanAccessPatient(user, pid);
    return this.progress.get(pid);
  }
}
