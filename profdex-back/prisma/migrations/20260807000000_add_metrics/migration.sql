-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'aluno';
ALTER TABLE "users" ADD COLUMN "engagement_score" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "active_ms" INTEGER NOT NULL DEFAULT 0,
    "user_agent" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_hourly" (
    "id" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "metrics_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_engagement_score_idx" ON "users"("engagement_score" DESC);

-- CreateIndex
CREATE INDEX "user_sessions_user_id_started_at_idx" ON "user_sessions"("user_id", "started_at");
CREATE INDEX "user_sessions_started_at_idx" ON "user_sessions"("started_at");
CREATE INDEX "user_sessions_ended_at_last_seen_at_idx" ON "user_sessions"("ended_at", "last_seen_at");

-- CreateIndex
CREATE INDEX "app_events_type_occurred_at_idx" ON "app_events"("type", "occurred_at");
CREATE INDEX "app_events_user_id_occurred_at_idx" ON "app_events"("user_id", "occurred_at");
CREATE INDEX "app_events_occurred_at_idx" ON "app_events"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_hourly_bucket_metric_key" ON "metrics_hourly"("bucket", "metric");
CREATE INDEX "metrics_hourly_bucket_idx" ON "metrics_hourly"("bucket");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
