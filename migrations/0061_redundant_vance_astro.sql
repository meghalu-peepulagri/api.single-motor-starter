DROP INDEX "motor_schedule_unique_idx";--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "failure_reason" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "failure_reason" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "motor_schedule_unique_idx" ON "motor_schedules" USING btree ("motor_id","schedule_id") WHERE status != 'ARCHIVED' AND schedule_status NOT IN ('COMPLETED','MISSED','PARTIAL','FAILED','DELETED');