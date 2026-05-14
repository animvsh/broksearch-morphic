ALTER TABLE "usage_events"
  ADD COLUMN IF NOT EXISTS "surface" text DEFAULT 'api' NOT NULL,
  ADD COLUMN IF NOT EXISTS "runtime" text,
  ADD COLUMN IF NOT EXISTS "source" text,
  ADD COLUMN IF NOT EXISTS "session_id" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

CREATE INDEX IF NOT EXISTS "usage_events_surface_idx"
  ON "usage_events" ("surface");

CREATE INDEX IF NOT EXISTS "usage_events_source_idx"
  ON "usage_events" ("source");

CREATE INDEX IF NOT EXISTS "usage_events_session_idx"
  ON "usage_events" ("session_id");
