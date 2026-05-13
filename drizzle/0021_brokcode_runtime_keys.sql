CREATE TABLE IF NOT EXISTS "brokcode_runtime_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "user_id" text NOT NULL,
  "api_key_id" uuid REFERENCES "api_keys"("id"),
  "key_name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "encrypted_key" text NOT NULL,
  "environment" "environment" NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_session_id" text DEFAULT 'default' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "last_validated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brokcode_runtime_keys_workspace_user_unique_idx"
  ON "brokcode_runtime_keys" ("workspace_id", "user_id");

CREATE INDEX IF NOT EXISTS "brokcode_runtime_keys_workspace_idx"
  ON "brokcode_runtime_keys" ("workspace_id");

CREATE INDEX IF NOT EXISTS "brokcode_runtime_keys_user_idx"
  ON "brokcode_runtime_keys" ("user_id");
