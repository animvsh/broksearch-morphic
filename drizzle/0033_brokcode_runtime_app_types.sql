ALTER TABLE "brokcode_runtime_sandboxes"
  DROP CONSTRAINT IF EXISTS "brokcode_runtime_sandboxes_app_type_check";

ALTER TABLE "brokcode_runtime_sandboxes"
  ADD CONSTRAINT "brokcode_runtime_sandboxes_app_type_check"
    CHECK ("app_type" IN ('static_html', 'vite_react', 'nextjs', 'unsupported'));
