import { GamesService } from './games.service';

describe('GamesService', () => {
  it('maps rows to GameDto in canonical order', async () => {
    const prisma: any = {
      game: {
        findMany: jest.fn().mockResolvedValue([
          { slug: 'maze', name: 'M', isReady: false, primaryDomain: { key: 'direction' } },
          { slug: 'spot', name: 'S', isReady: true, primaryDomain: { key: 'memory' } },
        ]),
      },
    };
    expect(await new GamesService(prisma).list()).toEqual([
      { id: 'spot', name: 'S', domain: 'memory', ready: true },
      { id: 'maze', name: 'M', domain: 'direction', ready: false },
    ]);
  });
});
