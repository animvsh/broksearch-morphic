ALTER TABLE "app_access_allowlist"
  ADD COLUMN IF NOT EXISTS "features" jsonb;
