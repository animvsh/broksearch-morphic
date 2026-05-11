ALTER TABLE "presentation_generations"
ADD COLUMN IF NOT EXISTS "prompt" text;
--> statement-breakpoint
UPDATE "presentation_generations"
SET "prompt" = 'Legacy presentation generation'
WHERE "prompt" IS NULL;
--> statement-breakpoint
ALTER TABLE "presentation_generations"
ALTER COLUMN "prompt" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "presentation_generations"
ADD COLUMN IF NOT EXISTS "cost_usd" integer DEFAULT 0 NOT NULL;
