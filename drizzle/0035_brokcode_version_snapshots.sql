ALTER TABLE "brokcode_versions"
  ADD COLUMN IF NOT EXISTS "checkpoint_name" text,
  ADD COLUMN IF NOT EXISTS "project_id" text,
  ADD COLUMN IF NOT EXISTS "deployment_url" text,
  ADD COLUMN IF NOT EXISTS "file_snapshot" jsonb;
