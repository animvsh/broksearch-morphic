CREATE TABLE IF NOT EXISTS "feature_requests" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "user_id" varchar(255),
  "account_email" text,
  "request" text NOT NULL,
  "page_url" text NOT NULL,
  "user_agent" text,
  "status" varchar(256) DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "feature_requests_status_check" CHECK ("status" IN ('open', 'reviewed', 'closed'))
);

CREATE INDEX IF NOT EXISTS "feature_requests_user_id_idx"
  ON "feature_requests" ("user_id");

CREATE INDEX IF NOT EXISTS "feature_requests_account_email_idx"
  ON "feature_requests" ("account_email");

CREATE INDEX IF NOT EXISTS "feature_requests_created_at_idx"
  ON "feature_requests" ("created_at" DESC);

ALTER TABLE "feature_requests" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feature_requests'
      AND policyname = 'feature_requests_select_policy'
  ) THEN
    CREATE POLICY "feature_requests_select_policy"
    ON "feature_requests"
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feature_requests'
      AND policyname = 'feature_requests_insert_policy'
  ) THEN
    CREATE POLICY "feature_requests_insert_policy"
    ON "feature_requests"
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (true);
  END IF;
END $$;
