CREATE TABLE "device_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer NOT NULL,
	"motor_id" integer,
	"status" varchar NOT NULL,
	"time_stamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motor_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer NOT NULL,
	"motor_id" integer NOT NULL,
	"status" varchar NOT NULL,
	"time_stamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "power_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer NOT NULL,
	"motor_id" integer,
	"status" varchar NOT NULL,
	"time_stamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_status_history" ADD CONSTRAINT "device_status_history_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_status_history" ADD CONSTRAINT "device_status_history_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_status_history" ADD CONSTRAINT "motor_status_history_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_status_history" ADD CONSTRAINT "motor_status_history_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_status_history" ADD CONSTRAINT "power_status_history_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_status_history" ADD CONSTRAINT "power_status_history_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_status_history_starter_motor_time_desc_idx" ON "device_status_history" USING btree ("starter_id","motor_id","time_stamp" desc);--> statement-breakpoint
CREATE INDEX "motor_status_history_starter_motor_time_desc_idx" ON "motor_status_history" USING btree ("starter_id","motor_id","time_stamp" desc);--> statement-breakpoint
CREATE INDEX "power_status_history_starter_motor_time_desc_idx" ON "power_status_history" USING btree ("starter_id","motor_id","time_stamp" desc);