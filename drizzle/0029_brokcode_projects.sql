CREATE TABLE IF NOT EXISTS "brokcode_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "username" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "preview_url" text,
  "deployment_url" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brokcode_projects_workspace_slug_unique_idx"
  ON "brokcode_projects" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "brokcode_projects_workspace_idx"
  ON "brokcode_projects" ("workspace_id");
CREATE INDEX IF NOT EXISTS "brokcode_projects_user_idx"
  ON "brokcode_projects" ("user_id");
CREATE INDEX IF NOT EXISTS "brokcode_projects_username_idx"
  ON "brokcode_projects" ("username");

CREATE TABLE IF NOT EXISTS "brokcode_project_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "brokcode_projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "path" text NOT NULL,
  "content" text NOT NULL,
  "language" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brokcode_project_files_project_path_unique_idx"
  ON "brokcode_project_files" ("project_id", "path");
CREATE INDEX IF NOT EXISTS "brokcode_project_files_project_idx"
  ON "brokcode_project_files" ("project_id");
CREATE INDEX IF NOT EXISTS "brokcode_project_files_workspace_idx"
  ON "brokcode_project_files" ("workspace_id");

CREATE TABLE IF NOT EXISTS "brokcode_deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "brokcode_projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "provider" text DEFAULT 'railway' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "url" text,
  "subdomain" text,
  "logs" jsonb,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brokcode_deployments_project_idx"
  ON "brokcode_deployments" ("project_id");
CREATE INDEX IF NOT EXISTS "brokcode_deployments_workspace_idx"
  ON "brokcode_deployments" ("workspace_id");
CREATE INDEX IF NOT EXISTS "brokcode_deployments_subdomain_idx"
  ON "brokcode_deployments" ("subdomain");
