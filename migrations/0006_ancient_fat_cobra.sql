ALTER TABLE "users" ADD COLUMN "alternate_phone_1" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alternate_phone_2" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alternate_phone_3" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alternate_phone_4" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alternate_phone_5" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_alt_phone_1_idx" ON "users" USING btree ("alternate_phone_1") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_alt_phone_2_idx" ON "users" USING btree ("alternate_phone_2") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_alt_phone_3_idx" ON "users" USING btree ("alternate_phone_3") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_alt_phone_4_idx" ON "users" USING btree ("alternate_phone_4") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_alt_phone_5_idx" ON "users" USING btree ("alternate_phone_5") WHERE "users"."status" != 'ARCHIVED';