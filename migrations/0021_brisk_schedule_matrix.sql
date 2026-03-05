UPDATE "motor_schedules"
SET "days_of_week" = '{}'::integer[]
WHERE "days_of_week" IS NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules"
ALTER COLUMN "days_of_week" SET DEFAULT '{}'::integer[];--> statement-breakpoint
ALTER TABLE "motor_schedules"
ALTER COLUMN "days_of_week" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_schedules"
ADD CONSTRAINT "motor_schedules_days_of_week_enum_chk"
CHECK ("days_of_week" <@ ARRAY[0,1,2,3,4,5,6]::integer[]);
