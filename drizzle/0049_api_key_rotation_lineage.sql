ALTER TABLE "api_keys" ADD COLUMN "rotated_from_key_id" uuid;
ALTER TABLE "api_keys" ADD COLUMN "rotated_to_key_id" uuid;
ALTER TABLE "api_keys" ADD COLUMN "rotated_at" timestamp;

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_rotated_from_key_id_api_keys_id_fk" FOREIGN KEY ("rotated_from_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_rotated_to_key_id_api_keys_id_fk" FOREIGN KEY ("rotated_to_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "api_keys_rotated_from_idx" ON "api_keys" USING btree ("rotated_from_key_id");
CREATE INDEX "api_keys_rotated_to_idx" ON "api_keys" USING btree ("rotated_to_key_id");
