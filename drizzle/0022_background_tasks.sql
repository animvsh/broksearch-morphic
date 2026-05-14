CREATE TABLE IF NOT EXISTS "background_tasks" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "chat_id" varchar(191),
  "kind" varchar(256) NOT NULL,
  "status" varchar(256) DEFAULT 'queued' NOT NULL,
  "title" text NOT NULL,
  "metadata" jsonb,
  "result" jsonb,
  "error" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "background_tasks_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS "background_tasks_user_id_idx" ON "background_tasks" ("user_id");
CREATE INDEX IF NOT EXISTS "background_tasks_user_status_idx" ON "background_tasks" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "background_tasks_chat_id_idx" ON "background_tasks" ("chat_id");
CREATE INDEX IF NOT EXISTS "background_tasks_created_at_idx" ON "background_tasks" ("created_at" DESC);

ALTER TABLE "background_tasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_background_tasks"
ON "background_tasks"
AS PERMISSIVE
FOR ALL
TO public
USING ("user_id" = current_setting('app.current_user_id', true))
WITH CHECK ("user_id" = current_setting('app.current_user_id', true));
