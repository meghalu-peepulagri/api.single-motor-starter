-- Migration to fix column types that were incorrectly added as integers
-- This file replaces the previous 0049 and ensures the database matches the current schema

-- Fix benched_starter_parameters
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_start_time" TYPE varchar USING schedule_start_time::varchar;--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_end_time" TYPE varchar USING schedule_end_time::varchar;--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_type" TYPE varchar USING schedule_type::varchar;--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_failure_at" TYPE timestamp USING to_timestamp(schedule_failure_at);--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "schedule_failure_reason" TYPE varchar USING schedule_failure_reason::varchar;--> statement-breakpoint

-- Fix starter_parameters
ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_start_time" TYPE varchar USING schedule_start_time::varchar;--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_end_time" TYPE varchar USING schedule_end_time::varchar;--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_type" TYPE varchar USING schedule_type::varchar;--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_failure_at" TYPE timestamp USING to_timestamp(schedule_failure_at);--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "schedule_failure_reason" TYPE varchar USING schedule_failure_reason::varchar;--> statement-breakpoint

-- These columns might still need to be added if they weren't in previous migrations, 
-- but if they already exist, we use ALTER. To be safe, we use DO blocks for ADD if not exists.

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