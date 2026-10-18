import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { UserDto } from '@cognicare/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateSettingsDto } from './dto/settings.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me/settings')
  @Roles('patient')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto): Promise<UserDto> {
    return this.users.updateSettings(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<UserDto> {
    return this.users.getForUser(user, id);
  }
}
