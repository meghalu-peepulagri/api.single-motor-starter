CREATE TYPE "public"."payload_version" AS ENUM('1.0', '2.0');--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "payload_version" "payload_version" DEFAULT '1.0' NOT NULL;--> statement-breakpoint
UPDATE "starter_boxes"
   SET "payload_version" = '2.0'
 WHERE "motor_support_type" = 'MULTIPLE_MOTORS'
    OR "starter_type" = 'MULTI_STARTER';