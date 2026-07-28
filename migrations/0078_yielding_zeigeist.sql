ALTER TABLE "starter_default_settings_limits" ADD COLUMN "lvt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "lvt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "hvt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "hvt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "ipt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "ipt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "drt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "drt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "olt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "olt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "opt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "opt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "cit_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "cit_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "lvt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "hvt_time" real DEFAULT 3;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "ipt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "drt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "olt_time" real DEFAULT 3;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "opt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "cit_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "lvt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "lvt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "hvt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "hvt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ipt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "ipt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "drt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "drt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "olt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "olt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "opt_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "opt_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "cit_time_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "cit_time_max" real;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "lvt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "hvt_time" real DEFAULT 3;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "ipt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "drt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "olt_time" real DEFAULT 3;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "opt_time" real DEFAULT 2;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "cit_time" real DEFAULT 2;