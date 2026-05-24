CREATE TABLE IF NOT EXISTS "connector_action_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "chat_id" text,
  "toolkit" text NOT NULL,
  "action" text NOT NULL,
  "tool_slug" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "approval_id" text,
  "payload_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "result" jsonb,
  "error" text,
  "approved_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connector_action_runs_user_status_idx"
  ON "connector_action_runs" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "connector_action_runs_toolkit_idx"
  ON "connector_action_runs" ("toolkit");

CREATE INDEX IF NOT EXISTS "connector_action_runs_created_at_idx"
  ON "connector_action_runs" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "connector_approval_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "connector_action_runs"("id"),
  "user_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "payload_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "approved_at" timestamp,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connector_approval_requests_run_idx"
  ON "connector_approval_requests" ("run_id");

CREATE INDEX IF NOT EXISTS "connector_approval_requests_user_status_idx"
  ON "connector_approval_requests" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "connector_approval_requests_expires_at_idx"
  ON "connector_approval_requests" ("expires_at");

CREATE TABLE IF NOT EXISTS "connector_action_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "connector_action_runs"("id"),
  "user_id" text NOT NULL,
  "event_type" text NOT NULL,
  "message" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connector_action_events_run_idx"
  ON "connector_action_events" ("run_id");

CREATE INDEX IF NOT EXISTS "connector_action_events_user_idx"
  ON "connector_action_events" ("user_id");

CREATE INDEX IF NOT EXISTS "connector_action_events_created_at_idx"
  ON "connector_action_events" ("created_at" DESC);
