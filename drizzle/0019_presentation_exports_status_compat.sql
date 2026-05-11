ALTER TABLE "presentation_exports"
  DROP CONSTRAINT IF EXISTS "presentation_exports_status_check";

ALTER TABLE "presentation_exports"
  ADD CONSTRAINT "presentation_exports_status_check"
  CHECK ("status" = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'done'::text, 'error'::text]));
