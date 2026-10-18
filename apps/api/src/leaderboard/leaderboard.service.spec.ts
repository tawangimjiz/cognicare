import { BadRequestException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

const mk = (flat: string[], rank: number | null = null, score: string | null = null) => {
  const client = {
    zrevrange: jest.fn().mockResolvedValue(flat), zrevrank: jest.fn().mockResolvedValue(rank), zscore: jest.fn().mockResolvedValue(score),
  };
  return { svc: new LeaderboardService({ client } as any), client };
};
const patient = { id: 'p2', role: 'patient', jti: 'j' } as const;

describe('LeaderboardService', () => {
  it('400 on unknown game', async () => {
    await expect(mk([]).svc.get(patient, 'nope')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('maps ranks, marks me, never exposes ids', async () => {
    const { svc, client } = mk(['p1', '90', 'p2', '75.5'], 1, '75.5');
    const r = await svc.get(patient, 'spot');
    expect(client.zrevrange).toHaveBeenCalledWith('lb:spot', 0, 9, 'WITHSCORES');
    expect(r).toEqual({ gameId: 'spot', top: [{ rank: 1, score: 90, isMe: false }, { rank: 2, score: 75.5, isMe: true }], me: { rank: 2, score: 75.5 } });
  });
  it('me null when unranked; non-patient skips rank lookup', async () => {
    expect((await mk([]).svc.get(patient, 'maze')).me).toBeNull();
    const { svc, client } = mk(['p1', '10']);
    const r = await svc.get({ id: 'd', role: 'doctor', jti: 'j' }, 'oneback');
    expect(r.me).toBeNull();
    expect(client.zrevrank).not.toHaveBeenCalled();
  });
});
