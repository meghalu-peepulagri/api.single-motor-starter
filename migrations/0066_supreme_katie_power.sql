ALTER TABLE "motor_schedules" ADD COLUMN "device_schedule_id" integer;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "last_device_schedule_id" integer DEFAULT 0 NOT NULL;