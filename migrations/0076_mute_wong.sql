ALTER TABLE "starter_default_settings_limits" ADD COLUMN "step_delay_min" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "step_delay_max" integer;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "start_time_min" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "start_time_max" integer;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "transfer_time_min" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "transfer_time_max" integer;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "step_delay" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "start_time" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "transfer_time" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "step_delay_min" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "step_delay_max" integer;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "start_time_min" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "start_time_max" integer;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "transfer_time_min" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "transfer_time_max" integer;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "step_delay" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "start_time" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "transfer_time" integer DEFAULT 0;