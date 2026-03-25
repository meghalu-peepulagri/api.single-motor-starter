CREATE TYPE "public"."payment_status" AS ENUM('RECEIVED', 'PENDING', 'PARTIAL', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "starter_dispatch" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer NOT NULL,
	"part_no" varchar,
	"box_serial_no" varchar,
	"pcb_number" varchar,
	"warranty_end_date" varchar,
	"sim_no" varchar,
	"sim_recharge_end_date" varchar,
	"production_date" varchar,
	"software_version" varchar,
	"hardware_version" varchar,
	"dispatch_date" varchar,
	"customer_name" varchar NOT NULL,
	"contact_number" varchar,
	"address" varchar,
	"location" varchar,
	"product_name" varchar,
	"qty" integer DEFAULT 1 NOT NULL,
	"remarks" varchar,
	"mode_of_dispatch" varchar,
	"tracking_details" varchar,
	"mode_of_payment" varchar,
	"payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"invoice_no" varchar,
	"invoice_date" varchar,
	"status" "status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starter_dispatch" ADD CONSTRAINT "starter_dispatch_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_dispatch" ADD CONSTRAINT "starter_dispatch_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_dispatch" ADD CONSTRAINT "starter_dispatch_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "starter_dispatch_id_idx" ON "starter_dispatch" USING btree ("id");--> statement-breakpoint
CREATE INDEX "starter_dispatch_starter_id_idx" ON "starter_dispatch" USING btree ("starter_id");--> statement-breakpoint
CREATE INDEX "starter_dispatch_status_idx" ON "starter_dispatch" USING btree ("status");--> statement-breakpoint
CREATE INDEX "starter_dispatch_created_by_idx" ON "starter_dispatch" USING btree ("created_by");