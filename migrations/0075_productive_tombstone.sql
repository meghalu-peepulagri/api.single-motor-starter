ALTER TYPE "public"."motor_starter_type" ADD VALUE 'STAR_DELTA';--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "multi_motor_default_limits" jsonb;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "multi_motor_defaults" jsonb;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "multi_motor_limits" jsonb;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "multi_motor_config" jsonb;