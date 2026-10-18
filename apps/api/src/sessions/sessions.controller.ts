import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessService } from '../users/access.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import { EndSessionDto, StartSessionDto } from './dto/session.dto';
import { SessionsService } from './sessions.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService, private readonly access: AccessService) {}

  @Post('sessions') @Roles('patient')
  start(@CurrentUser() user: AuthUser, @Body() body: StartSessionDto) {
    return this.sessions.start(user.id, body);
  }

  @Put('sessions/:id') @Roles('patient')
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: EndSessionDto) {
    return this.sessions.end(user.id, id, body);
  }

  @Get('results/:userId')
  async results(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Query('limit') limit?: string) {
    const pid = this.access.resolvePatientId(user, userId);
    await this.access.assertCanAccessPatient(user, pid);
    return this.sessions.results(pid, limit ? Number(limit) : 20);
  }
}
