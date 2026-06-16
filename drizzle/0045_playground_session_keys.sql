CREATE TABLE IF NOT EXISTS "playground_session_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "api_key_id" uuid,
  "key_prefix" text NOT NULL,
  "encrypted_key" text NOT NULL,
  "environment" "environment" DEFAULT 'test' NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playground_session_keys" ADD CONSTRAINT "playground_session_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playground_session_keys" ADD CONSTRAINT "playground_session_keys_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "playground_session_keys_workspace_user_unique_idx"
  ON "playground_session_keys" ("workspace_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playground_session_keys_workspace_idx"
  ON "playground_session_keys" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playground_session_keys_user_idx"
  ON "playground_session_keys" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playground_session_keys_expires_at_idx"
  ON "playground_session_keys" ("expires_at");
