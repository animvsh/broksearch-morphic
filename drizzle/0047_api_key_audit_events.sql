CREATE TYPE "api_key_audit_actor_type" AS ENUM ('user', 'admin', 'system');
--> statement-breakpoint
CREATE TYPE "api_key_audit_event_type" AS ENUM (
  'created',
  'secret_revealed_once',
  'secret_acknowledged',
  'paused',
  'resumed',
  'revoked',
  'rotated',
  'expiry_updated',
  'denied_expired_key_usage'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_key_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces" ("id"),
  "api_key_id" uuid REFERENCES "api_keys" ("id"),
  "actor_user_id" text,
  "actor_type" "api_key_audit_actor_type" DEFAULT 'user' NOT NULL,
  "event_type" "api_key_audit_event_type" NOT NULL,
  "key_prefix" text NOT NULL,
  "request_id" text,
  "ip_address" text,
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_audit_events_workspace_created_idx"
  ON "api_key_audit_events" ("workspace_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_audit_events_api_key_created_idx"
  ON "api_key_audit_events" ("api_key_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_audit_events_actor_created_idx"
  ON "api_key_audit_events" ("actor_user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_audit_events_type_idx"
  ON "api_key_audit_events" ("event_type");
