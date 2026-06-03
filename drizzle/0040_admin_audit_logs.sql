-- Admin audit log table
--
-- Records every privileged admin action (paused API key, deleted
-- presentation, disabled public share, suspended user, changed
-- provider route, changed rate limit, issued refund, etc.) so
-- support, finance, and owners can answer "who did what, when."

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" text,
  "admin_email" text,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "before_value" jsonb,
  "after_value" jsonb,
  "metadata" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "admin_audit_logs_admin_user_idx"
  ON "admin_audit_logs" ("admin_user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx"
  ON "admin_audit_logs" ("action");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_idx"
  ON "admin_audit_logs" ("target_type", "target_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx"
  ON "admin_audit_logs" ("created_at" DESC);
</content>
</invoke>