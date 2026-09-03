ALTER TABLE "starter_default_settings_limits" ADD COLUMN "irt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "irt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "irt_time" real DEFAULT 0.5;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "irt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "irt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "irt_time" real DEFAULT 0.5;