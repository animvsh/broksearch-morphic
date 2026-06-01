ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "source_markdown" text;
