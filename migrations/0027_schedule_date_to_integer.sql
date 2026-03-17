ALTER TABLE "motor_schedules" ADD COLUMN IF NOT EXISTS "schedule_start_date" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN IF NOT EXISTS "schedule_end_date" integer;