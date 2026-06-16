CREATE TABLE IF NOT EXISTS "app_access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "phone_number" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "user_id" text,
  "source" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp,
  "reviewed_by" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_access_requests_email_unique_idx"
  ON "app_access_requests" ("email");

CREATE INDEX IF NOT EXISTS "app_access_requests_status_idx"
  ON "app_access_requests" ("status");

CREATE INDEX IF NOT EXISTS "app_access_requests_created_at_idx"
  ON "app_access_requests" ("created_at" DESC);
