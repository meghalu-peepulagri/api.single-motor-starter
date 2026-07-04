-- Migration to fix column types that were incorrectly added as integers.
-- Made idempotent: each column is ADDED if it is missing, otherwise its TYPE is fixed.
-- This works whether the column is absent, still an integer, or already the correct type,
-- so the migration no longer fails on databases where these columns were never created.

-- =============================== benched_starter_parameters ===============================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='benched_starter_parameters' AND column_name='schedule_start_time') THEN
        ALTER TABLE "benched_starter_parameters" ADD COLUMN "schedule_start_time" varchar;
    ELSE
        ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_start_time" TYPE varchar USING "schedule_start_time"::varchar;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='benched_starter_parameters' AND column_name='schedule_end_time') THEN
        ALTER TABLE "benched_starter_parameters" ADD COLUMN "schedule_end_time" varchar;
    ELSE
        ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_end_time" TYPE varchar USING "schedule_end_time"::varchar;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='benched_starter_parameters' AND column_name='schedule_type') THEN
        ALTER TABLE "benched_starter_parameters" ADD COLUMN "schedule_type" varchar;
    ELSE
        ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_type" TYPE varchar USING "schedule_type"::varchar;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='benched_starter_parameters' AND column_name='schedule_failure_at') THEN
        ALTER TABLE "benched_starter_parameters" ADD COLUMN "schedule_failure_at" timestamp;
    ELSIF (SELECT data_type FROM information_schema.columns WHERE table_name='benched_starter_parameters' AND column_name='schedule_failure_at') IN ('integer','bigint','numeric','double precision','real') THEN
        ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_failure_at" TYPE timestamp USING to_timestamp(schedule_failure_at);
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='benched_starter_parameters' AND column_name='schedule_failure_reason') THEN
        ALTER TABLE "benched_starter_parameters" ADD COLUMN "schedule_failure_reason" varchar;
    ELSE
        ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_failure_reason" TYPE varchar USING "schedule_failure_reason"::varchar;
    END IF;
END $$;--> statement-breakpoint

-- =============================== starter_parameters ===============================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_start_time') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_start_time" varchar;
    ELSE
        ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_start_time" TYPE varchar USING "schedule_start_time"::varchar;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_end_time') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_end_time" varchar;
    ELSE
        ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_end_time" TYPE varchar USING "schedule_end_time"::varchar;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_type') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_type" varchar;
    ELSE
        ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_type" TYPE varchar USING "schedule_type"::varchar;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_failure_at') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_failure_at" timestamp;
    ELSIF (SELECT data_type FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_failure_at') IN ('integer','bigint','numeric','double precision','real') THEN
        ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_failure_at" TYPE timestamp USING to_timestamp(schedule_failure_at);
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_failure_reason') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_failure_reason" varchar;
    ELSE
        ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_failure_reason" TYPE varchar USING "schedule_failure_reason"::varchar;
    END IF;
END $$;--> statement-breakpoint

-- Columns that may not have existed in previous migrations — add only if missing.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='fault_cleared') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "fault_cleared" boolean DEFAULT false NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_id') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_id" integer;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_runtime_minutes') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_runtime_minutes" integer;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='starter_parameters' AND column_name='schedule_missed_minutes') THEN
        ALTER TABLE "starter_parameters" ADD COLUMN "schedule_missed_minutes" integer;
    END IF;
END $$;
