WITH ranked_slides AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "presentation_id", "slide_index"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS row_number
  FROM "presentation_slides"
)
DELETE FROM "presentation_slides"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_slides
  WHERE row_number > 1
);
--> statement-breakpoint
DROP INDEX IF EXISTS "presentation_slides_presentation_id_index_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "presentation_slides_presentation_id_index_idx"
ON "presentation_slides" ("presentation_id", "slide_index");
