ALTER TABLE "gateways" ADD COLUMN "gateway_number" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX "validate_gateway_number" ON "gateways" USING btree (lower("gateway_number")) WHERE "gateways"."status" != 'ARCHIVED';

