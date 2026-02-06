ALTER TABLE "starter_default_settings_limits" ALTER COLUMN "prd_url" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "ca_fn" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "bkr_adrs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "sn" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "usrn" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "pswd" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "prd_url" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "prd_url" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ALTER COLUMN "sms_pswd" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ALTER COLUMN "prd_url" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "starter_settings" ALTER COLUMN "prd_url" SET DATA TYPE varchar;