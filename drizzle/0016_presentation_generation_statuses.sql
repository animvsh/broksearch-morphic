ALTER TABLE "presentation_generations"
DROP CONSTRAINT IF EXISTS "presentation_generations_status_check";
--> statement-breakpoint
ALTER TABLE "presentation_generations"
ADD CONSTRAINT "presentation_generations_status_check"
CHECK (
  "status" IN (
    'started',
    'completed',
    'failed',
    'success',
    'error'
  )
);
