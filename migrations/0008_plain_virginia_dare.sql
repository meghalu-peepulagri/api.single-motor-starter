ALTER TABLE "starter_parameters" ALTER COLUMN "group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "signal_quality" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "network_type" varchar DEFAULT 'NUll' NOT NULL;