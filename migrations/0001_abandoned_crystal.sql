CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"user_id" integer NOT NULL,
	"created_by" integer,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_name_idx" ON "locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_status_idx" ON "locations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_location_per_user" ON "locations" USING btree (lower("name"),"user_id") WHERE "locations"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX "full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "user_status_idx" ON "users" USING btree ("status");