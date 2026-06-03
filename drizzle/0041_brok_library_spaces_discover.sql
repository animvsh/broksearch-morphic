-- Brok Library, Spaces, and Discover schema

DO $$ BEGIN
  CREATE TYPE "library_item_kind" AS ENUM (
    'search', 'chat', 'project', 'presentation', 'api_session'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "library_item_status" AS ENUM (
    'active', 'archived', 'shared', 'deleted'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "space_role" AS ENUM (
    'owner', 'editor', 'viewer'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "space_visibility" AS ENUM (
    'private', 'link', 'public'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "discover_item_kind" AS ENUM (
    'thread', 'project', 'presentation', 'prompt', 'api_session'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "discover_category" AS ENUM (
    'ai_apps', 'search', 'code', 'chat', 'presentations'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "library_tags_user_id_name_unique"
  ON "library_tags" ("user_id", "name");
CREATE INDEX IF NOT EXISTS "library_tags_user_id_idx"
  ON "library_tags" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "kind" "library_item_kind" NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "href" text NOT NULL,
  "model" text,
  "status" "library_item_status" DEFAULT 'active' NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "use_count" integer DEFAULT 0 NOT NULL,
  "cite_count" integer DEFAULT 0 NOT NULL,
  "source_ref_id" text,
  "metadata" jsonb,
  "last_used_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "library_items_user_id_idx"
  ON "library_items" ("user_id");
CREATE INDEX IF NOT EXISTS "library_items_user_id_kind_idx"
  ON "library_items" ("user_id", "kind");
CREATE INDEX IF NOT EXISTS "library_items_user_id_status_idx"
  ON "library_items" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "library_items_user_id_updated_idx"
  ON "library_items" ("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "library_items_user_id_use_count_idx"
  ON "library_items" ("user_id", "use_count" DESC);
CREATE INDEX IF NOT EXISTS "library_items_user_id_cite_count_idx"
  ON "library_items" ("user_id", "cite_count" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_item_tags" (
  "library_item_id" uuid NOT NULL REFERENCES "library_items"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "library_tags"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "library_item_tags_unique"
  ON "library_item_tags" ("library_item_id", "tag_id");
CREATE INDEX IF NOT EXISTS "library_item_tags_tag_idx"
  ON "library_item_tags" ("tag_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "owner_user_id" text NOT NULL,
  "visibility" "space_visibility" DEFAULT 'private' NOT NULL,
  "invite_token" text,
  "icon_color" text,
  "metadata" jsonb,
  "member_count" integer DEFAULT 1 NOT NULL,
  "thread_count" integer DEFAULT 0 NOT NULL,
  "project_count" integer DEFAULT 0 NOT NULL,
  "presentation_count" integer DEFAULT 0 NOT NULL,
  "last_activity_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "spaces_slug_unique"
  ON "spaces" ("slug");
CREATE INDEX IF NOT EXISTS "spaces_owner_user_id_idx"
  ON "spaces" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "spaces_visibility_idx"
  ON "spaces" ("visibility");
CREATE INDEX IF NOT EXISTS "spaces_last_activity_idx"
  ON "spaces" ("last_activity_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "space_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "space_id" uuid NOT NULL REFERENCES "spaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "email" text,
  "display_name" text,
  "role" "space_role" DEFAULT 'editor' NOT NULL,
  "last_active_at" timestamp,
  "invited_at" timestamp DEFAULT now() NOT NULL,
  "accepted_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_members_space_user_unique"
  ON "space_members" ("space_id", "user_id");
CREATE INDEX IF NOT EXISTS "space_members_user_id_idx"
  ON "space_members" ("user_id");
CREATE INDEX IF NOT EXISTS "space_members_space_id_idx"
  ON "space_members" ("space_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "space_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "space_id" uuid NOT NULL REFERENCES "spaces"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "space_projects_space_id_idx"
  ON "space_projects" ("space_id");
CREATE INDEX IF NOT EXISTS "space_projects_space_id_updated_idx"
  ON "space_projects" ("space_id", "updated_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "space_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "space_id" uuid NOT NULL REFERENCES "spaces"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "space_role" DEFAULT 'viewer' NOT NULL,
  "token" text NOT NULL,
  "invited_by" text NOT NULL,
  "expires_at" timestamp,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_invites_token_unique"
  ON "space_invites" ("token");
CREATE INDEX IF NOT EXISTS "space_invites_space_id_idx"
  ON "space_invites" ("space_id");
CREATE INDEX IF NOT EXISTS "space_invites_email_idx"
  ON "space_invites" ("email");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discover_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "discover_item_kind" NOT NULL,
  "category" "discover_category" NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "author_name" text,
  "author_handle" text,
  "href" text NOT NULL,
  "thumbnail_url" text,
  "like_count" integer DEFAULT 0 NOT NULL,
  "save_count" integer DEFAULT 0 NOT NULL,
  "share_count" integer DEFAULT 0 NOT NULL,
  "view_count" integer DEFAULT 0 NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "metadata" jsonb,
  "published_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "discover_items_category_idx"
  ON "discover_items" ("category");
CREATE INDEX IF NOT EXISTS "discover_items_kind_idx"
  ON "discover_items" ("kind");
CREATE INDEX IF NOT EXISTS "discover_items_published_at_idx"
  ON "discover_items" ("published_at" DESC);
CREATE INDEX IF NOT EXISTS "discover_items_featured_idx"
  ON "discover_items" ("is_featured");
CREATE INDEX IF NOT EXISTS "discover_items_like_count_idx"
  ON "discover_items" ("like_count" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trending_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "category" "discover_category" NOT NULL,
  "velocity" integer DEFAULT 0 NOT NULL,
  "window" text DEFAULT '24h' NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL,
  "captured_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "trending_topics_category_idx"
  ON "trending_topics" ("category");
CREATE INDEX IF NOT EXISTS "trending_topics_window_idx"
  ON "trending_topics" ("window");
CREATE INDEX IF NOT EXISTS "trending_topics_rank_idx"
  ON "trending_topics" ("rank");
