import { Injectable } from '@nestjs/common';
import { GAMES, type DomainKey, type GameDto, type GameSlug } from '@cognicare/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<GameDto[]> {
    const rows = await this.prisma.game.findMany({ include: { primaryDomain: true } });
    const order = (s: string) => GAMES.findIndex((g) => g.id === s);
    return rows
      .sort((a, b) => order(a.slug) - order(b.slug))
      .map((g) => ({ id: g.slug as GameSlug, name: g.name, domain: g.primaryDomain.key as DomainKey, ready: g.isReady }));
  }
}
