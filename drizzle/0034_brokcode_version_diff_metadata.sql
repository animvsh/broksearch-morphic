ALTER TABLE "brokcode_versions"
  ADD COLUMN IF NOT EXISTS "diff_metadata" jsonb;
