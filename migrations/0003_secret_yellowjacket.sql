CREATE TABLE "motors_run_time" (
	"id" serial PRIMARY KEY NOT NULL,
	"motor_id" integer,
	"starter_box_id" integer,
	"location_id" integer,
	"motor_ref_id" varchar,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration" varchar,
	"motor_state" integer,
	"motor_description" text,
	"starter_mode" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_starter_box_id_starter_boxes_id_fk" FOREIGN KEY ("starter_box_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "motorIdxRunTime" ON "motors_run_time" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX "starterBoxIdxRunTime" ON "motors_run_time" USING btree ("starter_box_id");--> statement-breakpoint
CREATE INDEX "pondIdxRunTime" ON "motors_run_time" USING btree ("location_id");