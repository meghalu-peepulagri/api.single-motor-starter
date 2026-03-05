ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
DROP TYPE "public"."schedule_status";--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('PENDING', 'SCHEDULED', 'RUNNING', 'STOPPED', 'COMPLETED', 'FAILED', 'CANCELLED', 'DELETED', 'RESTARTED');--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DEFAULT 'PENDING'::"public"."schedule_status";--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DATA TYPE "public"."schedule_status" USING "schedule_status"::"public"."schedule_status";--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "acknowledged_at" timestamp;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "last_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "last_stopped_at" timestamp;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "deleted_by" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "status" "status_enum" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD CONSTRAINT "motor_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD CONSTRAINT "motor_schedules_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;