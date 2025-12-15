ALTER TABLE "motors_run_time" ADD COLUMN "power_state" integer;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD COLUMN "power_start_time" timestamp;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD COLUMN "power_end_time" timestamp;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD COLUMN "power_duration" varchar;