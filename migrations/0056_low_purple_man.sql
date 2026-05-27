ALTER TYPE "public"."schedule_status" ADD VALUE 'PARTIAL' BEFORE 'FAILED';--> statement-breakpoint
ALTER TYPE "public"."schedule_status" ADD VALUE 'MISSED' BEFORE 'FAILED';--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "motor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "motor_id" DROP NOT NULL;