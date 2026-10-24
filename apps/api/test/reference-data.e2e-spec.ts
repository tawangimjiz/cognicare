import '../src/env';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { DOMAINS, GAMES } from '@cognicare/shared';

// A production database only ever gets `prisma migrate deploy` (never the seed), so the
// reference data sessions depend on (domains, games, levels, metrics) must come from migrations.
describe('Reference data from migrations only (fresh DB, no seed)', () => {
  const dbName = `cognicare_migtest_${process.pid}`;
  const baseUrl = new URL(process.env.DATABASE_URL!);
  const freshUrl = new URL(baseUrl);
  freshUrl.pathname = `/${dbName}`;
  const admin = new PrismaClient();
  let fresh: PrismaClient;

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    execSync('npx prisma migrate deploy', {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: freshUrl.toString() },
      stdio: 'pipe',
    });
    fresh = new PrismaClient({ datasourceUrl: freshUrl.toString() });
  }, 120000);

  afterAll(async () => {
    await fresh?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.$disconnect();
  });

  it('has every cognitive domain with domain_id = index + 1', async () => {
    const rows = await fresh.cognitiveDomain.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((r) => [r.id, r.key])).toEqual(DOMAINS.map((d, i) => [i + 1, d.key]));
  });

  it('has every game with its primary domain, ready flag and tiers 1..3', async () => {
    const games = await fresh.game.findMany({ include: { levels: true } });
    expect(games).toHaveLength(GAMES.length);
    for (const g of GAMES) {
      const row = games.find((x) => x.slug === g.id);
      expect(row).toMatchObject({ name: g.name, primaryDomainId: g.domainIdx + 1, isReady: g.ready });
      expect(row!.levels.map((l) => l.tier).sort()).toEqual([1, 2, 3]);
    }
  });

  it('has the metric definitions sessions are scored against', async () => {
    const rows = await fresh.metricDefinition.findMany({ include: { game: true, domain: true } });
    const pairs = rows.map((r) => `${r.game.slug}:${r.domain.key}:${r.maxRawScore}`).sort();
    expect(pairs).toEqual([
      'maze:direction:100', 'maze:speed:100', 'oneback:focus:100', 'oneback:speed:100', 'spot:focus:100', 'spot:memory:100',
    ]);
  });
});
