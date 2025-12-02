CREATE TYPE "public"."mode_enum" AS ENUM('LOCAL+MANUAL', 'REMOTE+MANUAL', 'LOCAL+AUTO', 'REMOTE+AUTO');--> statement-breakpoint
CREATE TABLE "fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"created_by" integer NOT NULL,
	"location_id" integer NOT NULL,
	"acres" numeric(10, 2),
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"filed_id" integer NOT NULL,
	"state" integer DEFAULT 0 NOT NULL,
	"mode" "mode_enum" DEFAULT 'LOCAL+AUTO' NOT NULL,
	"created_by" integer NOT NULL,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_filed_id_fields_id_fk" FOREIGN KEY ("filed_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "filed_user_id_idx" ON "fields" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "location_id_idx" ON "fields" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "field_status_idx" ON "fields" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_field_per_user_location" ON "fields" USING btree (lower("name"),"location_id","created_by") WHERE "fields"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX "motor_user_id_idx" ON "motors" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "motor_idx" ON "motors" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_motor_per_field" ON "motors" USING btree (lower("name"),"filed_id") WHERE "motors"."status" != 'ARCHIVED';