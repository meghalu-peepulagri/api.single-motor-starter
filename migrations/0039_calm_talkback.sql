CREATE TYPE "public"."motor_support_type" AS ENUM('SINGLE_MOTOR', 'MULTIPLE_MOTORS');--> statement-breakpoint
ALTER TABLE "gateways" ADD COLUMN "gateway_number" varchar;--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "motor_index" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "motor_support_type" "motor_support_type" DEFAULT 'SINGLE_MOTOR' NOT NULL;