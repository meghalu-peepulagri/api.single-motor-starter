ALTER TABLE "starter_boxes" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "power" integer DEFAULT 0 NOT NULL;