-- Add per-key salt for API key hashing
--
-- Legacy rows have no per-key salt; they continue to verify via the
-- global salt only. New rows are issued with a 16-byte random key_salt
-- and the hash is computed as sha256(key + key_salt + SECRET_SALT).
-- The verify path checks for a per-key salt first and falls back to
-- the global-salt hash for legacy keys.

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_salt" text;
