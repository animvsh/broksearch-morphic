CREATE TABLE IF NOT EXISTS "brokcode_runtime_sandboxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "brokcode_projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "version_id" text,
  "session_id" text,
  "institution_id" text,
  "course_id" text,
  "section_id" text,
  "assignment_id" text,
  "app_type" text NOT NULL,
  "package_manager" text NOT NULL,
  "workspace_path" text NOT NULL,
  "install_command" text,
  "dev_command" text NOT NULL,
  "build_command" text,
  "status" text DEFAULT 'preparing' NOT NULL,
  "ports" jsonb DEFAULT '[]'::jsonb,
  "logs" jsonb DEFAULT '[]'::jsonb,
  "health" jsonb,
  "metadata" jsonb,
  "started_at" timestamp,
  "stopped_at" timestamp,
  "last_healthcheck_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "brokcode_runtime_sandboxes_status_check"
    CHECK ("status" IN ('preparing', 'installing', 'building', 'running', 'healthy', 'crashed', 'timed_out', 'stopped')),
  CONSTRAINT "brokcode_runtime_sandboxes_app_type_check"
    CHECK ("app_type" IN ('static_html', 'vite_react')),
  CONSTRAINT "brokcode_runtime_sandboxes_package_manager_check"
    CHECK ("package_manager" IN ('none', 'bun', 'npm', 'pnpm', 'yarn'))
);

CREATE INDEX IF NOT EXISTS "brokcode_runtime_sandboxes_project_idx"
  ON "brokcode_runtime_sandboxes" ("project_id");
CREATE INDEX IF NOT EXISTS "brokcode_runtime_sandboxes_workspace_idx"
  ON "brokcode_runtime_sandboxes" ("workspace_id");
CREATE INDEX IF NOT EXISTS "brokcode_runtime_sandboxes_user_idx"
  ON "brokcode_runtime_sandboxes" ("user_id");
CREATE INDEX IF NOT EXISTS "brokcode_runtime_sandboxes_status_idx"
  ON "brokcode_runtime_sandboxes" ("status");
CREATE INDEX IF NOT EXISTS "brokcode_runtime_sandboxes_version_idx"
  ON "brokcode_runtime_sandboxes" ("version_id");
CREATE INDEX IF NOT EXISTS "brokcode_runtime_sandboxes_updated_at_idx"
  ON "brokcode_runtime_sandboxes" ("updated_at" DESC);
