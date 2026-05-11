DO $$ BEGIN
  CREATE TYPE "public"."endpoint" AS ENUM('chat', 'search', 'code', 'agents');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."environment" AS ENUM('test', 'live');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."key_status" AS ENUM('active', 'paused', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'team', 'scale', 'enterprise');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."export_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."generation_status" AS ENUM('started', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."outline_status" AS ENUM('generating', 'ready', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."presentation_status" AS ENUM('draft', 'generating', 'outline_generating', 'slides_generating', 'ready', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "plan" "plan" DEFAULT 'free' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "monthly_budget_cents" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "environment" "environment" NOT NULL,
  "status" "key_status" DEFAULT 'active' NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rpm_limit" integer DEFAULT 60,
  "daily_request_limit" integer DEFAULT 5000,
  "monthly_budget_cents" integer DEFAULT 0,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brok_model" text NOT NULL,
  "provider_name" text NOT NULL,
  "provider_model" text NOT NULL,
  "priority" integer DEFAULT 1,
  "is_active" boolean DEFAULT true NOT NULL,
  "input_cost_per_million" numeric(10, 4) DEFAULT '0',
  "output_cost_per_million" numeric(10, 4) DEFAULT '0',
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "api_key_id" uuid,
  "limit_type" text NOT NULL,
  "limit_value" integer NOT NULL,
  "current_value" integer NOT NULL,
  "blocked" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
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
CREATE TABLE IF NOT EXISTS "presentations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "workspace_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "status" "presentation_status" DEFAULT 'draft' NOT NULL,
  "theme_id" text,
  "language" text DEFAULT 'en' NOT NULL,
  "style" text,
  "slide_count" integer DEFAULT 0 NOT NULL,
  "share_id" text,
  "is_public" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "presentations_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presentation_slides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "presentation_id" uuid NOT NULL,
  "slide_index" integer NOT NULL,
  "title" text NOT NULL,
  "layout_type" text NOT NULL,
  "content_json" jsonb NOT NULL,
  "speaker_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presentation_outlines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "presentation_id" uuid NOT NULL,
  "outline_json" jsonb NOT NULL,
  "status" "outline_status" DEFAULT 'generating' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "presentation_outlines_presentation_id_unique" UNIQUE("presentation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presentation_themes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "name" text NOT NULL,
  "theme_json" jsonb NOT NULL,
  "is_builtin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presentation_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "presentation_id" uuid NOT NULL,
  "slide_id" uuid,
  "asset_type" text NOT NULL,
  "url" text,
  "provider" text NOT NULL,
  "prompt" text,
  "metadata_json" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presentation_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "presentation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "prompt" text NOT NULL,
  "generation_type" text NOT NULL,
  "model" text NOT NULL,
  "web_search_enabled" boolean DEFAULT false NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" integer DEFAULT 0 NOT NULL,
  "status" "generation_status" DEFAULT 'started' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presentation_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "presentation_id" uuid NOT NULL,
  "export_type" text NOT NULL,
  "file_url" text,
  "status" "export_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_prefix" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_hash" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "environment" "environment";
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "status" "key_status" DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "scopes" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "allowed_models" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rpm_limit" integer DEFAULT 60;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "daily_request_limit" integer DEFAULT 5000;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "monthly_budget_cents" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "brok_model" text;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "provider_name" text;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "provider_model" text;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "input_cost_per_million" numeric(10, 4) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "output_cost_per_million" numeric(10, 4) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "api_key_id" uuid;
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "limit_type" text;
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "limit_value" integer;
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "current_value" integer;
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "blocked" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "rate_limit_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "request_id" text;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "api_key_id" uuid;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "endpoint" "endpoint";
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "model" text;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "input_tokens" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "output_tokens" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "cached_tokens" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "search_queries" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "pages_fetched" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "tool_calls" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "provider_cost_usd" numeric(10, 6) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "billed_usd" numeric(10, 6) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "latency_ms" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'success';
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "error_code" text;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rate_limit_events" ADD CONSTRAINT "rate_limit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rate_limit_events" ADD CONSTRAINT "rate_limit_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
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
DO $$ BEGIN
  ALTER TABLE "presentation_assets" ADD CONSTRAINT "presentation_assets_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "presentation_assets" ADD CONSTRAINT "presentation_assets_slide_id_presentation_slides_id_fk" FOREIGN KEY ("slide_id") REFERENCES "public"."presentation_slides"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "presentation_exports" ADD CONSTRAINT "presentation_exports_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "presentation_generations" ADD CONSTRAINT "presentation_generations_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "presentation_outlines" ADD CONSTRAINT "presentation_outlines_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "presentation_slides" ADD CONSTRAINT "presentation_slides_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_workspace_idx" ON "api_keys" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_routes_brok_model_idx" ON "provider_routes" USING btree ("brok_model");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_workspace_idx" ON "usage_events" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_api_key_idx" ON "usage_events" USING btree ("api_key_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_created_at_idx" ON "usage_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_assets_presentation_id_idx" ON "presentation_assets" USING btree ("presentation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_assets_slide_id_idx" ON "presentation_assets" USING btree ("slide_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_exports_presentation_id_idx" ON "presentation_exports" USING btree ("presentation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_exports_status_idx" ON "presentation_exports" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_generations_presentation_id_idx" ON "presentation_generations" USING btree ("presentation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_generations_user_id_idx" ON "presentation_generations" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_generations_created_at_idx" ON "presentation_generations" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_outlines_presentation_id_idx" ON "presentation_outlines" USING btree ("presentation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_slides_presentation_id_idx" ON "presentation_slides" USING btree ("presentation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_slides_presentation_id_index_idx" ON "presentation_slides" USING btree ("presentation_id","slide_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_themes_user_id_idx" ON "presentation_themes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentation_themes_is_builtin_idx" ON "presentation_themes" USING btree ("is_builtin");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentations_user_id_idx" ON "presentations" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentations_user_id_created_at_idx" ON "presentations" USING btree ("user_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentations_workspace_id_idx" ON "presentations" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentations_share_id_idx" ON "presentations" USING btree ("share_id");
