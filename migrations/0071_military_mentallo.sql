ALTER TABLE "benched_starter_parameters" ADD COLUMN "schedule_failure_code" integer;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD COLUMN "failure_code" integer;