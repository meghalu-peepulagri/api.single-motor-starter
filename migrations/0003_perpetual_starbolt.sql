DROP INDEX "unique_mail_idx";--> statement-breakpoint
DROP INDEX "unique_phone_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "unique_mail_idx" ON "users" USING btree ("email") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_phone_idx" ON "users" USING btree ("phone") WHERE "users"."status" != 'ARCHIVED';