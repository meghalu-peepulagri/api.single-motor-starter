ALTER TABLE "starter_default_settings" ADD COLUMN "vflt_under_voltage" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "vflt_over_voltage" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "vflt_voltage_imbalance" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "vflt_phase_failure" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "cflt_dry_run" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "cflt_over_current" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "cflt_output_phase_fail" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "cflt_curr_imbalance" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "vflt_under_voltage" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "vflt_over_voltage" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "vflt_voltage_imbalance" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "vflt_phase_failure" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "cflt_dry_run" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "cflt_over_current" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "cflt_output_phase_fail" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "cflt_curr_imbalance" integer DEFAULT 0;