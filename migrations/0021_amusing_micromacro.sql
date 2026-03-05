ALTER TYPE "public"."schedule_type" RENAME TO "schedule_mode";--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_type" SET DEFAULT 'TIME_BASED'::text;--> statement-breakpoint
DROP TYPE "public"."schedule_mode";--> statement-breakpoint
CREATE TYPE "public"."schedule_mode" AS ENUM('TIME_BASED', 'CYCLIC');--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_type" SET DEFAULT 'TIME_BASED'::"public"."schedule_mode";--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_type" SET DATA TYPE "public"."schedule_mode" USING "schedule_type"::"public"."schedule_mode";--> statement-breakpoint
DROP INDEX "motor_schedule_unique_idx";--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "days_of_week" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "starter_id" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "schedule_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "runtime_minutes" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "cycle_on_minutes" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "cycle_off_minutes" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "power_loss_recovery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "accumulated_on_seconds" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "manually_stopped" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "repeat" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD CONSTRAINT "motor_schedules_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "motor_schedule_starter_id_idx" ON "motor_schedules" USING btree ("starter_id");--> statement-breakpoint
CREATE INDEX "motor_schedule_status_idx" ON "motor_schedules" USING btree ("schedule_status");--> statement-breakpoint
CREATE UNIQUE INDEX "motor_schedule_unique_idx" ON "motor_schedules" USING btree ("motor_id","schedule_id");