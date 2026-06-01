-- Seed provider_routes for the Brok → upstream model mapping.
--
-- Idempotent: re-running this migration only overwrites rows whose
-- current values differ from the seed values, so a newer operator
-- edit is preserved. The provider_name 'minimax' here is the internal
-- routing key consumed by lib/brok/provider-router.ts; the user-facing
-- brand is 'brok' and is masked at the API/UI layer.

UPDATE "provider_routes"
SET
  "provider_name" = 'minimax',
  "provider_model" = 'minimax-m2.7',
  "is_active" = true
WHERE "brok_model" IN (
  'brok-lite',
  'brok-search',
  'brok-search-pro',
  'brok-code',
  'brok-agent',
  'brok-reasoning'
)
AND (
  "provider_name" IS DISTINCT FROM 'minimax'
  OR "provider_model" IS DISTINCT FROM 'minimax-m2.7'
  OR "is_active" IS DISTINCT FROM true
);
