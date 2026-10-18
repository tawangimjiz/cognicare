import { BadRequestException, Injectable } from '@nestjs/common';
import { GAMES, type GameSlug, type LeaderboardResponse } from '@cognicare/shared';
import type { AuthUser } from '../auth/auth.types';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly redis: RedisService) {}

  async get(user: AuthUser, gameId: string): Promise<LeaderboardResponse> {
    if (!GAMES.some((g) => g.id === gameId)) throw new BadRequestException('unknown game');
    const key = `lb:${gameId}`;
    const flat = await this.redis.client.zrevrange(key, 0, 9, 'WITHSCORES');
    const top: LeaderboardResponse['top'] = [];
    for (let i = 0; i < flat.length; i += 2) {
      top.push({ rank: i / 2 + 1, score: Number(flat[i + 1]), isMe: flat[i] === user.id });
    }
    let me: LeaderboardResponse['me'] = null;
    if (user.role === 'patient') {
      const [rank, score] = await Promise.all([
        this.redis.client.zrevrank(key, user.id), this.redis.client.zscore(key, user.id),
      ]);
      if (rank !== null && score !== null) me = { rank: rank + 1, score: Number(score) };
    }
    return { gameId: gameId as GameSlug, top, me };
  }
}
