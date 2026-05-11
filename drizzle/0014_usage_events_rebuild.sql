DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usage_events'
      AND column_name = 'feature'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'usage_events_legacy_brok_backup'
  ) THEN
    ALTER TABLE "usage_events" RENAME TO "usage_events_legacy_brok_backup";
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" text NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "api_key_id" uuid,
  "endpoint" "endpoint" NOT NULL,
  "model" text NOT NULL,
  "provider" text NOT NULL,
  "input_tokens" integer DEFAULT 0,
  "output_tokens" integer DEFAULT 0,
  "cached_tokens" integer DEFAULT 0,
  "search_queries" integer DEFAULT 0,
  "pages_fetched" integer DEFAULT 0,
  "tool_calls" integer DEFAULT 0,
  "provider_cost_usd" numeric(10, 6) DEFAULT '0',
  "billed_usd" numeric(10, 6) DEFAULT '0',
  "latency_ms" integer DEFAULT 0,
  "status" text DEFAULT 'success' NOT NULL,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'usage_events_legacy_brok_backup'
  ) THEN
    INSERT INTO "usage_events" (
      "request_id",
      "workspace_id",
      "user_id",
      "api_key_id",
      "endpoint",
      "model",
      "provider",
      "input_tokens",
      "output_tokens",
      "cached_tokens",
      "search_queries",
      "pages_fetched",
      "tool_calls",
      "provider_cost_usd",
      "billed_usd",
      "latency_ms",
      "status",
      "error_code",
      "created_at"
    )
    SELECT
      COALESCE("request_id", 'legacy_' || "id"::text),
      "workspace_id",
      COALESCE("user_id", 'legacy-user'),
      "api_key_id",
      CASE
        WHEN COALESCE("endpoint"::text, '') IN ('chat', 'search', 'code', 'agents')
          THEN "endpoint"::text::"endpoint"
        ELSE 'chat'::"endpoint"
      END,
      COALESCE("model", 'legacy-model'),
      COALESCE("provider", 'legacy'),
      COALESCE("input_tokens", 0),
      COALESCE("output_tokens", 0),
      COALESCE("cached_tokens", 0),
      COALESCE("search_queries", 0),
      COALESCE("pages_fetched", 0),
      COALESCE("tool_calls", 0),
      COALESCE("provider_cost_usd", 0),
      COALESCE("billed_usd", 0),
      COALESCE("latency_ms", 0),
      COALESCE("status", 'success'),
      "error_code",
      COALESCE("created_at", now())
    FROM "usage_events_legacy_brok_backup"
    WHERE "workspace_id" IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_workspace_idx" ON "usage_events" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_api_key_idx" ON "usage_events" USING btree ("api_key_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_created_at_idx" ON "usage_events" USING btree ("created_at");
