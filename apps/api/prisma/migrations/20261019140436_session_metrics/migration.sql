-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "metrics" JSONB;

-- Tiers 4 (2-back) and 5 (3-back) for every existing game (seed creates 1..5 for fresh DBs).
INSERT INTO "game_levels" ("level_id", "game_id", "tier")
SELECT gen_random_uuid(), g."game_id", t.tier
FROM "games" g CROSS JOIN (VALUES (4), (5)) AS t(tier)
ON CONFLICT ("game_id", "tier") DO NOTHING;
