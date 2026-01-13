ALTER TABLE "motors_run_time" ADD COLUMN IF NOT EXISTS "power_start" varchar;
ALTER TABLE "motors_run_time" ADD COLUMN IF NOT EXISTS "power_end" varchar;
ALTER TABLE "motors_run_time" ADD COLUMN IF NOT EXISTS "power_state" integer;
ALTER TABLE "motors_run_time" ADD COLUMN IF NOT EXISTS "power_duration" varchar;
