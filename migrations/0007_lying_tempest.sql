ALTER TABLE "starter_settings_limits" RENAME COLUMN "ig_r" TO "ig_r_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "ig_y" TO "ig_r_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "ig_b" TO "ig_y_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "io_r" TO "ig_y_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "io_y" TO "ig_b_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "io_b" TO "ig_b_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "io_r_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "io_r_max" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "io_y_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "io_y_max" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "io_b_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "io_b_max" real DEFAULT 0;