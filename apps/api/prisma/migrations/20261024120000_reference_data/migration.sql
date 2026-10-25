-- Reference data every environment needs (mirrors DOMAINS / GAMES in packages/shared/src/domain.ts).
-- ON CONFLICT keeps this safe on databases that already got these rows from the old seed.

INSERT INTO "cognitive_domains" ("domain_id", "key", "name_th", "color") VALUES
  (1, 'focus', 'สมาธิ', '#1A56DB'),
  (2, 'speed', 'ความเร็วคิด', '#0E7490'),
  (3, 'direction', 'ทิศทาง', '#B45309'),
  (4, 'language', 'ภาษา', '#7C3AED'),
  (5, 'memory', 'ความจำ', '#0F766E'),
  (6, 'mood', 'อารมณ์', '#BE185D')
ON CONFLICT DO NOTHING;

INSERT INTO "games" ("game_id", "slug", "name", "primary_domain_id", "is_ready") VALUES
  (gen_random_uuid(), 'spot', 'จับผิดภาพ', 5, true),
  (gen_random_uuid(), 'oneback', 'One Back Task', 1, true),
  (gen_random_uuid(), 'maze', 'เขาวงกต 3D', 3, false)
ON CONFLICT DO NOTHING;

INSERT INTO "game_levels" ("level_id", "game_id", "tier")
SELECT gen_random_uuid(), g."game_id", t.tier
FROM "games" g CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS t(tier)
ON CONFLICT DO NOTHING;

INSERT INTO "metric_definitions" ("game_id", "domain_id", "max_raw_score")
SELECT g."game_id", m.domain_id, 100
FROM (VALUES ('spot', 5), ('spot', 1), ('oneback', 1), ('oneback', 2), ('maze', 3), ('maze', 2)) AS m(slug, domain_id)
JOIN "games" g ON g."slug" = m.slug
ON CONFLICT DO NOTHING;

-- One Back is playable now; databases that got the old seed still have is_ready = false for it.
UPDATE "games" SET "is_ready" = true WHERE "slug" = 'oneback';
