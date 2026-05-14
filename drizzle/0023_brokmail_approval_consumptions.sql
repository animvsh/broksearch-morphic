CREATE TABLE IF NOT EXISTS "brokmail_approval_consumptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "approval_id" text NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "payload_hash" text NOT NULL,
  "consumed_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brokmail_approval_consumptions_approval_user_unique_idx"
  ON "brokmail_approval_consumptions" ("approval_id", "user_id");

CREATE INDEX IF NOT EXISTS "brokmail_approval_consumptions_user_idx"
  ON "brokmail_approval_consumptions" ("user_id");

CREATE INDEX IF NOT EXISTS "brokmail_approval_consumptions_consumed_at_idx"
  ON "brokmail_approval_consumptions" ("consumed_at");
