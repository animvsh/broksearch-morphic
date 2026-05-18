CREATE TABLE IF NOT EXISTS "app_access_allowlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "note" text,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_access_allowlist_email_unique_idx"
  ON "app_access_allowlist" ("email");

CREATE INDEX IF NOT EXISTS "app_access_allowlist_status_idx"
  ON "app_access_allowlist" ("status");
