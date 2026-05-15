CREATE TABLE IF NOT EXISTS "brokcode_sessions" (
  "row_id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brokcode_sessions_workspace_session_unique_idx"
  ON "brokcode_sessions" ("workspace_id", "session_id");

CREATE INDEX IF NOT EXISTS "brokcode_sessions_workspace_idx"
  ON "brokcode_sessions" ("workspace_id");

CREATE INDEX IF NOT EXISTS "brokcode_sessions_user_idx"
  ON "brokcode_sessions" ("user_id");

CREATE INDEX IF NOT EXISTS "brokcode_sessions_updated_at_idx"
  ON "brokcode_sessions" ("updated_at");

CREATE TABLE IF NOT EXISTS "brokcode_session_events" (
  "id" text PRIMARY KEY NOT NULL,
  "session_row_id" text NOT NULL REFERENCES "brokcode_sessions"("row_id") ON DELETE CASCADE,
  "session_id" text NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "source" text NOT NULL,
  "role" text NOT NULL,
  "type" text NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brokcode_session_events_session_idx"
  ON "brokcode_session_events" ("session_id");

CREATE INDEX IF NOT EXISTS "brokcode_session_events_session_row_idx"
  ON "brokcode_session_events" ("session_row_id");

CREATE INDEX IF NOT EXISTS "brokcode_session_events_workspace_idx"
  ON "brokcode_session_events" ("workspace_id");

CREATE INDEX IF NOT EXISTS "brokcode_session_events_created_at_idx"
  ON "brokcode_session_events" ("created_at");

CREATE TABLE IF NOT EXISTS "brokcode_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "command" text NOT NULL,
  "summary" text NOT NULL,
  "runtime" text NOT NULL,
  "status" text NOT NULL,
  "preview_url" text,
  "branch" text,
  "commit_sha" text,
  "pr_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brokcode_versions_workspace_idx"
  ON "brokcode_versions" ("workspace_id");

CREATE INDEX IF NOT EXISTS "brokcode_versions_session_idx"
  ON "brokcode_versions" ("session_id");

CREATE INDEX IF NOT EXISTS "brokcode_versions_created_at_idx"
  ON "brokcode_versions" ("created_at");
