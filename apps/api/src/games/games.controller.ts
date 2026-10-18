import { Controller, Get, UseGuards } from '@nestjs/common';
import type { GameDto } from '@cognicare/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GamesService } from './games.service';

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(): Promise<GameDto[]> {
    return this.games.list();
  }
}
