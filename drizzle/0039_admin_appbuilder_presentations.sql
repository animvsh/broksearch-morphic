-- 0039_admin_appbuilder_presentations.sql
-- Adds schema for App Builder admin pages (brokcode_generations, brokcode_builds,
-- brokcode_exports) and Presentations admin pages (presentation_shares).

DO $$ BEGIN
  CREATE TYPE "app_project_status" AS ENUM (
    'draft',
    'generating',
    'preview_ready',
    'build_failed',
    'exported',
    'deleted',
    'suspended'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "app_generation_status" AS ENUM (
    'started',
    'completed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "app_export_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "presentation_share_status" AS ENUM (
    'active',
    'revoked',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "brokcode_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "brokcode_projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "prompt" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
  "files_changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "build_result" text DEFAULT 'pending',
  "status" "app_generation_status" DEFAULT 'started' NOT NULL,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brokcode_generations_project_idx"
  ON "brokcode_generations" ("project_id");
CREATE INDEX IF NOT EXISTS "brokcode_generations_workspace_idx"
  ON "brokcode_generations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "brokcode_generations_user_idx"
  ON "brokcode_generations" ("user_id");
CREATE INDEX IF NOT EXISTS "brokcode_generations_status_idx"
  ON "brokcode_generations" ("status");
CREATE INDEX IF NOT EXISTS "brokcode_generations_created_at_idx"
  ON "brokcode_generations" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "brokcode_builds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "brokcode_projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "build_command" text,
  "install_command" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "install_logs" text,
  "type_errors" jsonb DEFAULT '[]'::jsonb,
  "vite_errors" jsonb DEFAULT '[]'::jsonb,
  "repair_attempts" integer DEFAULT 0 NOT NULL,
  "final_status" text,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brokcode_builds_project_idx"
  ON "brokcode_builds" ("project_id");
CREATE INDEX IF NOT EXISTS "brokcode_builds_workspace_idx"
  ON "brokcode_builds" ("workspace_id");
CREATE INDEX IF NOT EXISTS "brokcode_builds_status_idx"
  ON "brokcode_builds" ("status");
CREATE INDEX IF NOT EXISTS "brokcode_builds_created_at_idx"
  ON "brokcode_builds" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "brokcode_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "brokcode_projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "export_type" text NOT NULL,
  "file_url" text,
  "status" "app_export_status" DEFAULT 'pending' NOT NULL,
  "error_code" text,
  "cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brokcode_exports_project_idx"
  ON "brokcode_exports" ("project_id");
CREATE INDEX IF NOT EXISTS "brokcode_exports_workspace_idx"
  ON "brokcode_exports" ("workspace_id");
CREATE INDEX IF NOT EXISTS "brokcode_exports_status_idx"
  ON "brokcode_exports" ("status");

CREATE TABLE IF NOT EXISTS "presentation_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "presentation_id" uuid NOT NULL REFERENCES "presentations"("id") ON DELETE CASCADE,
  "share_id" text NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "status" "presentation_share_status" DEFAULT 'active' NOT NULL,
  "view_count" integer DEFAULT 0 NOT NULL,
  "last_viewed_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "presentation_shares_share_id_unique"
  ON "presentation_shares" ("share_id");
CREATE INDEX IF NOT EXISTS "presentation_shares_presentation_id_idx"
  ON "presentation_shares" ("presentation_id");
CREATE INDEX IF NOT EXISTS "presentation_shares_status_idx"
  ON "presentation_shares" ("status");
