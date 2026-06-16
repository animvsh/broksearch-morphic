ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp;
CREATE INDEX "api_keys_expires_at_idx" ON "api_keys" USING btree ("expires_at");
