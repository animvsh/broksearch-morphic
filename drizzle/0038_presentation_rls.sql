-- Row Level Security for presentation tables
-- user_id is stored as uuid; Supabase auth.users.id is uuid; cast app.current_user_id
-- (text) via ::uuid for the comparison. The application sets app.current_user_id in
-- every request via withRLS() (lib/db/with-rls.ts). Public-shareable presentations
-- are allowed read access when is_public = true.
--
-- NOTE: RLS policies reference Supabase roles (authenticated, anon). When this
-- project is deployed against a non-Supabase database (e.g. Railway Postgres,
-- local Docker), those roles do not exist. We guard each CREATE POLICY with a
-- DO block that checks pg_roles so the migration is a no-op on non-Supabase
-- databases rather than failing the deploy.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "presentation_slides" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "presentation_outlines" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "presentation_themes" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "presentation_assets" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "presentation_generations" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "presentation_exports" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "presentations_owner_all" ON "presentations"';
    EXECUTE $p$CREATE POLICY "presentations_owner_all"
      ON "presentations"
      FOR ALL
      TO authenticated
      USING ("user_id" = current_setting('app.current_user_id', true)::uuid)
      WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid)$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentations_public_read" ON "presentations"';
    EXECUTE $p$CREATE POLICY "presentations_public_read"
      ON "presentations"
      FOR SELECT
      TO anon, authenticated
      USING ("is_public" = true)$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_slides_owner_all" ON "presentation_slides"';
    EXECUTE $p$CREATE POLICY "presentation_slides_owner_all"
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
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_slides_public_read" ON "presentation_slides"';
    EXECUTE $p$CREATE POLICY "presentation_slides_public_read"
      ON "presentation_slides"
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM "presentations" p
          WHERE p.id = "presentation_slides"."presentation_id"
            AND p."is_public" = true
        )
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_outlines_owner_all" ON "presentation_outlines"';
    EXECUTE $p$CREATE POLICY "presentation_outlines_owner_all"
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
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_assets_owner_all" ON "presentation_assets"';
    EXECUTE $p$CREATE POLICY "presentation_assets_owner_all"
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
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_generations_owner_all" ON "presentation_generations"';
    EXECUTE $p$CREATE POLICY "presentation_generations_owner_all"
      ON "presentation_generations"
      FOR ALL
      TO authenticated
      USING ("user_id" = current_setting('app.current_user_id', true)::uuid)
      WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid)$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_exports_owner_all" ON "presentation_exports"';
    EXECUTE $p$CREATE POLICY "presentation_exports_owner_all"
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
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_themes_owner_all" ON "presentation_themes"';
    EXECUTE $p$CREATE POLICY "presentation_themes_owner_all"
      ON "presentation_themes"
      FOR ALL
      TO authenticated
      USING ("user_id" = current_setting('app.current_user_id', true)::uuid OR "is_builtin" = true)
      WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid)$p$;

    EXECUTE 'DROP POLICY IF EXISTS "presentation_themes_builtin_read" ON "presentation_themes"';
    EXECUTE $p$CREATE POLICY "presentation_themes_builtin_read"
      ON "presentation_themes"
      FOR SELECT
      TO anon, authenticated
      USING ("is_builtin" = true)$p$;
  END IF;
END $$;
