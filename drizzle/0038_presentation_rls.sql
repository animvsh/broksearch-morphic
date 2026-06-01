-- Row Level Security for presentation tables
-- user_id is stored as uuid; Supabase auth.users.id is uuid; cast app.current_user_id
-- (text) via ::uuid for the comparison. The application sets app.current_user_id in
-- every request via withRLS() (lib/db/with-rls.ts). Public-shareable presentations
-- are allowed read access when is_public = true.

ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_slides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_outlines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_themes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_generations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_exports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "presentations_owner_all" ON "presentations";
--> statement-breakpoint
CREATE POLICY "presentations_owner_all"
  ON "presentations"
  FOR ALL
  TO authenticated
  USING ("user_id" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint

DROP POLICY IF EXISTS "presentations_public_read" ON "presentations";
--> statement-breakpoint
CREATE POLICY "presentations_public_read"
  ON "presentations"
  FOR SELECT
  TO anon, authenticated
  USING ("is_public" = true);
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_slides_owner_all" ON "presentation_slides";
--> statement-breakpoint
CREATE POLICY "presentation_slides_owner_all"
  ON "presentation_slides"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_slides"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_slides"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_slides_public_read" ON "presentation_slides";
--> statement-breakpoint
CREATE POLICY "presentation_slides_public_read"
  ON "presentation_slides"
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_slides"."presentation_id"
        AND p."is_public" = true
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_outlines_owner_all" ON "presentation_outlines";
--> statement-breakpoint
CREATE POLICY "presentation_outlines_owner_all"
  ON "presentation_outlines"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_outlines"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_outlines"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_assets_owner_all" ON "presentation_assets";
--> statement-breakpoint
CREATE POLICY "presentation_assets_owner_all"
  ON "presentation_assets"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_assets"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_assets"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_generations_owner_all" ON "presentation_generations";
--> statement-breakpoint
CREATE POLICY "presentation_generations_owner_all"
  ON "presentation_generations"
  FOR ALL
  TO authenticated
  USING ("user_id" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_exports_owner_all" ON "presentation_exports";
--> statement-breakpoint
CREATE POLICY "presentation_exports_owner_all"
  ON "presentation_exports"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_exports"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "presentations" p
      WHERE p.id = "presentation_exports"."presentation_id"
        AND p."user_id" = current_setting('app.current_user_id', true)::uuid
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_themes_owner_all" ON "presentation_themes";
--> statement-breakpoint
CREATE POLICY "presentation_themes_owner_all"
  ON "presentation_themes"
  FOR ALL
  TO authenticated
  USING ("user_id" = current_setting('app.current_user_id', true)::uuid OR "is_builtin" = true)
  WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint

DROP POLICY IF EXISTS "presentation_themes_builtin_read" ON "presentation_themes";
--> statement-breakpoint
CREATE POLICY "presentation_themes_builtin_read"
  ON "presentation_themes"
  FOR SELECT
  TO anon, authenticated
  USING ("is_builtin" = true);
