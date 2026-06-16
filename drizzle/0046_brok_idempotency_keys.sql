CREATE TABLE "brok_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"key" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"request_id" text,
	"response_status" integer,
	"response_body" jsonb,
	"response_headers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);

ALTER TABLE "brok_idempotency_keys" ADD CONSTRAINT "brok_idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "brok_idempotency_keys" ADD CONSTRAINT "brok_idempotency_keys_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "brok_idempotency_keys_unique_idx" ON "brok_idempotency_keys" USING btree ("workspace_id","api_key_id","route","key");
CREATE INDEX "brok_idempotency_keys_workspace_idx" ON "brok_idempotency_keys" USING btree ("workspace_id");
CREATE INDEX "brok_idempotency_keys_expires_at_idx" ON "brok_idempotency_keys" USING btree ("expires_at");
