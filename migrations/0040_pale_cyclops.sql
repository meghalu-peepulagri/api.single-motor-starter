ALTER TABLE "motor_schedules" ADD COLUMN "missed_minutes" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "failure_at" timestamp;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "failure_reason" integer DEFAULT 0;