import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly lb: LeaderboardService) {}

  @Get(':gameId')
  get(@CurrentUser() user: AuthUser, @Param('gameId') gameId: string) {
    return this.lb.get(user, gameId);
  }
}
