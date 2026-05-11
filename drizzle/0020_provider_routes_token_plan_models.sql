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
);
