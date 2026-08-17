ALTER TABLE "motors" ADD COLUMN "last_device_schedule_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill from existing live schedules so a motor's counter starts where the old
-- device-wide counter left off for that motor, instead of resetting to 0 and risking
-- a newly-assigned slot colliding with a still-live schedule already on that motor.
UPDATE "motors" m
   SET "last_device_schedule_id" = COALESCE((
     SELECT MAX(ms.device_schedule_id)
     FROM "motor_schedules" ms
     WHERE ms.motor_id = m.id
       AND ms.status != 'ARCHIVED'
       AND ms.schedule_status NOT IN ('FAILED', 'DELETED')
   ), 0);