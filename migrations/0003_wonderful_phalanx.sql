CREATE TYPE "public"."device_status" AS ENUM('ASSIGNED', 'DEPLOYED', 'READY ', 'TEST');--> statement-breakpoint
CREATE TABLE "gateways" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"label" varchar,
	"location_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"status" "status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starter_boxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"alias_name" varchar,
	"mac_address" varchar NOT NULL,
	"serial_number" varchar NOT NULL,
	"pcb_number" varchar NOT NULL,
	"starter_number" varchar NOT NULL,
	"status" "status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"user_id" integer,
	"created_by" integer,
	"device_status" "device_status" DEFAULT 'TEST' NOT NULL,
	"gateway_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "starter_id" integer;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gateway_idx" ON "gateways" USING btree ("id");--> statement-breakpoint
CREATE INDEX "gateway_user_id_idx" ON "gateways" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gateway_location_id_idx" ON "gateways" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "starter_box_id_idx" ON "starter_boxes" USING btree ("id");--> statement-breakpoint
CREATE INDEX "starter_box_user_id_idx" ON "starter_boxes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "starter_box_status_idx" ON "starter_boxes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "starter_box_device_status_idx" ON "starter_boxes" USING btree ("device_status");--> statement-breakpoint
CREATE UNIQUE INDEX "valid_starter_box_name" ON "starter_boxes" USING btree (lower("name")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "validate_serial_number" ON "starter_boxes" USING btree (lower("serial_number")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "validate_mac_address" ON "starter_boxes" USING btree (lower("mac_address")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "validate_pcb_number" ON "starter_boxes" USING btree (lower("pcb_number")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "validate_starter_number" ON "starter_boxes" USING btree (lower("starter_number")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" DROP COLUMN "mode";--> statement-breakpoint
DROP TYPE "public"."mode_enum";