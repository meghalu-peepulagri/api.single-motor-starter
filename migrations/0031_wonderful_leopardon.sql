DROP INDEX "motor_schedule_unique_idx";--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "motor_schedule_unique_idx" ON "motor_schedules" USING btree ("motor_id","schedule_id");