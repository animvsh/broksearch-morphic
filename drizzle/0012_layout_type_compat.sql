ALTER TABLE "presentation_slides"
DROP CONSTRAINT IF EXISTS "presentation_slides_layout_type_check";
--> statement-breakpoint
ALTER TABLE "presentation_slides"
ADD CONSTRAINT "presentation_slides_layout_type_check"
CHECK (
  "layout_type" IN (
    'title',
    'section',
    'two_column',
    'image_left',
    'chart',
    'quote',
    'text',
    'bullet'
  )
);
