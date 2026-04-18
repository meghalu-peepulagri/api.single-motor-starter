ALTER TABLE "motor_schedules" ADD COLUMN "actual_start_time" varchar;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "actual_end_time" varchar;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "actual_run_time" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "actual_type" "schedule_mode";