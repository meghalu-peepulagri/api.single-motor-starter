CREATE TABLE "device_temperature" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" integer NOT NULL,
	"motor_id" integer NOT NULL,
	"temperature" real NOT NULL,
	"time_stamp" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ADD COLUMN "temperature" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "limit_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_default_settings_limits" ADD COLUMN "limit_max" real DEFAULT 150;--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "limit" real DEFAULT 25;--> statement-breakpoint
ALTER TABLE "starter_parameters" ADD COLUMN "temperature" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "limit_min" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "starter_settings_limits" ADD COLUMN "limit_max" real DEFAULT 150;--> statement-breakpoint
ALTER TABLE "starter_settings" ADD COLUMN "limit" real DEFAULT 25;--> statement-breakpoint
ALTER TABLE "device_temperature" ADD CONSTRAINT "device_temperature_device_id_starter_boxes_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_temperature" ADD CONSTRAINT "device_temperature_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_temperature_device_id_idx" ON "device_temperature" USING btree ("device_id");