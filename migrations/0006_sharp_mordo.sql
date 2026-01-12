ALTER TABLE "user_activity_logs" RENAME COLUMN "field_name" TO "entity_type";--> statement-breakpoint
ALTER TABLE "user_activity_logs" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ALTER COLUMN "old_data" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ALTER COLUMN "new_data" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD COLUMN "entity_id" integer;--> statement-breakpoint
CREATE INDEX "entity_idx" ON "user_activity_logs" USING btree ("entity_type","entity_id");