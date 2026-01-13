DROP INDEX "filed_user_id_idx";--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "hardware_version" varchar;--> statement-breakpoint
CREATE INDEX "field_user_id_idx" ON "fields" USING btree ("created_by");