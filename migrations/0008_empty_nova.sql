ALTER TABLE "starter_settings_limits" RENAME COLUMN "vg_r" TO "vg_r_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "vg_y" TO "vg_y_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "vg_b" TO "vg_b_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "vo_r" TO "vg_b_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "vo_b" TO "vo_r_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" RENAME COLUMN "vo_y" TO "vo_r_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "vg_r_max" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "vg_y_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "vo_y_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "vo_y_max" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "vo_b_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "vo_b_max" real DEFAULT 0;