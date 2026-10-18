-- CreateEnum
CREATE TYPE "Role" AS ENUM ('patient', 'caregiver', 'doctor');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('in_progress', 'completed', 'timed_out', 'out_of_mistakes', 'abandoned');

-- CreateEnum
CREATE TYPE "TrendDirection" AS ENUM ('improving', 'stable', 'declining');

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "language_pref" TEXT NOT NULL DEFAULT 'th',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "patient_id" UUID NOT NULL,
    "date_of_birth" DATE,
    "mci_diagnosis_date" DATE,
    "baseline_moca_score" SMALLINT,
    "accessibility_settings" JSONB NOT NULL DEFAULT '{}',
    "assigned_doctor_id" UUID,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "caregiver_links" (
    "caregiver_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "relationship" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caregiver_links_pkey" PRIMARY KEY ("caregiver_id","patient_id")
);

-- CreateTable
CREATE TABLE "cognitive_domains" (
    "domain_id" SMALLINT NOT NULL,
    "key" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "cognitive_domains_pkey" PRIMARY KEY ("domain_id")
);

-- CreateTable
CREATE TABLE "games" (
    "game_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primary_domain_id" SMALLINT NOT NULL,
    "is_ready" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "games_pkey" PRIMARY KEY ("game_id")
);

-- CreateTable
CREATE TABLE "game_levels" (
    "level_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "tier" SMALLINT NOT NULL,
    "entropy_score" DOUBLE PRECISION,
    "avg_difficulty_score" DOUBLE PRECISION,
    "image_path" TEXT,

    CONSTRAINT "game_levels_pkey" PRIMARY KEY ("level_id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "session_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "level_id" UUID,
    "difficulty_tier" SMALLINT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "total_duration_ms" INTEGER,
    "session_status" "SessionStatus" NOT NULL DEFAULT 'in_progress',

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "event_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "reaction_time_ms" INTEGER,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "metric_id" SERIAL NOT NULL,
    "game_id" UUID NOT NULL,
    "domain_id" SMALLINT NOT NULL,
    "max_raw_score" DOUBLE PRECISION NOT NULL,
    "description" TEXT,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("metric_id")
);

-- CreateTable
CREATE TABLE "session_scores" (
    "score_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "domain_id" SMALLINT NOT NULL,
    "game_id" UUID NOT NULL,
    "error_rate" DOUBLE PRECISION,
    "mean_reaction_time_ms" INTEGER,
    "raw_score" DOUBLE PRECISION NOT NULL,
    "normalized_score" DOUBLE PRECISION NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_scores_pkey" PRIMARY KEY ("score_id")
);

-- CreateTable
CREATE TABLE "cognitive_trend_snapshots" (
    "snapshot_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "domain_id" SMALLINT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "avg_normalized_score" DOUBLE PRECISION NOT NULL,
    "session_count" INTEGER NOT NULL,
    "trend_direction" "TrendDirection" NOT NULL,
    "flagged_for_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cognitive_trend_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "patient_profiles_assigned_doctor_id_idx" ON "patient_profiles"("assigned_doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "cognitive_domains_key_key" ON "cognitive_domains"("key");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "game_levels_game_id_tier_key" ON "game_levels"("game_id", "tier");

-- CreateIndex
CREATE INDEX "game_sessions_patient_id_started_at_idx" ON "game_sessions"("patient_id", "started_at");

-- CreateIndex
CREATE INDEX "session_events_session_id_idx" ON "session_events"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_definitions_game_id_domain_id_key" ON "metric_definitions"("game_id", "domain_id");

-- CreateIndex
CREATE INDEX "session_scores_game_id_idx" ON "session_scores"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_scores_session_id_domain_id_key" ON "session_scores"("session_id", "domain_id");

-- CreateIndex
CREATE INDEX "cognitive_trend_snapshots_flagged_for_review_idx" ON "cognitive_trend_snapshots"("flagged_for_review");

-- CreateIndex
CREATE UNIQUE INDEX "cognitive_trend_snapshots_patient_id_domain_id_period_start_key" ON "cognitive_trend_snapshots"("patient_id", "domain_id", "period_start");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_assigned_doctor_id_fkey" FOREIGN KEY ("assigned_doctor_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_links" ADD CONSTRAINT "caregiver_links_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_links" ADD CONSTRAINT "caregiver_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_primary_domain_id_fkey" FOREIGN KEY ("primary_domain_id") REFERENCES "cognitive_domains"("domain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_levels" ADD CONSTRAINT "game_levels_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "game_levels"("level_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "cognitive_domains"("domain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_scores" ADD CONSTRAINT "session_scores_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_scores" ADD CONSTRAINT "session_scores_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "cognitive_domains"("domain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_scores" ADD CONSTRAINT "session_scores_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_trend_snapshots" ADD CONSTRAINT "cognitive_trend_snapshots_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_trend_snapshots" ADD CONSTRAINT "cognitive_trend_snapshots_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "cognitive_domains"("domain_id") ON DELETE RESTRICT ON UPDATE CASCADE;
