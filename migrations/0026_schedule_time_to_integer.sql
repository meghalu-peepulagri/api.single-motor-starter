-- Convert start_time from "HH:MM" to "HHMM" format (remove colon)
UPDATE "motor_schedules" SET "start_time" = REPLACE("start_time", ':', '') WHERE "start_time" LIKE '%:%';--> statement-breakpoint
UPDATE "motor_schedules" SET "end_time" = REPLACE("end_time", ':', '') WHERE "end_time" LIKE '%:%';