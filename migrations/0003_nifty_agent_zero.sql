ALTER TABLE "starter_default_settings" ADD COLUMN "drf" real DEFAULT 5;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "lrr" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "olr" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "opf_min" real DEFAULT 0.5;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "opf_max" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "drf_min" real DEFAULT 5;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "drf_max" real DEFAULT 20;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "irr_min" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "irr_max" real DEFAULT 50;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "olr_min" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "olr_max" real DEFAULT 50;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "cir_min" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "cir_max" real DEFAULT 50;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ug_r_min" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ug_r_max" real DEFAULT 65536;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ug_y_min" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ug_y_max" real DEFAULT 65536;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ug_b_min" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ug_b_max" real DEFAULT 65536;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ip_r_min" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ip_r_max" real DEFAULT 65536;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ip_y_min" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ip_y_max" real DEFAULT 65536;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ip_b_min" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ip_b_max" real DEFAULT 65536;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "drf" real DEFAULT 5;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "olr" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "llr" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "clr" real DEFAULT 10;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "allflt_en_min";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "allflt_en_max";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "f_dr";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "f_ol";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "f_lr";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "f_ci";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "opf";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "ug_r";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "ug_y";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "ug_b";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "ip_r";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "ip_y";--> statement-breakpoint
ALTER TABLE "starter_settings_limits" DROP COLUMN "ip_b";