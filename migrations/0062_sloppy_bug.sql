CREATE TYPE "public"."device_role" AS ENUM('STANDALONE', 'MASTER', 'CHILD');--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "role" "device_role" DEFAULT 'STANDALONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "parent_starter_id" integer;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_parent_starter_id_starter_boxes_id_fk" FOREIGN KEY ("parent_starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "starter_box_role_idx" ON "starter_boxes" USING btree ("role");--> statement-breakpoint
CREATE INDEX "starter_box_parent_starter_id_idx" ON "starter_boxes" USING btree ("parent_starter_id");