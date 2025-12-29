DROP INDEX "unique_mail_idx";--> statement-breakpoint
DROP INDEX "unique_phone_idx";--> statement-breakpoint
ALTER TABLE "starter_boxes" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ALTER COLUMN "mac_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ALTER COLUMN "pcb_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_mail_idx" ON "users" USING btree ("email") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_phone_idx" ON "users" USING btree ("phone") WHERE "users"."status" != 'ARCHIVED';