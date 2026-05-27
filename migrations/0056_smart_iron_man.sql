CREATE TYPE "public"."schedule_log_event" AS ENUM('CREATED', 'SENT_TO_DEVICE', 'DEVICE_ACK_CREATE', 'RESENT', 'STOP_SENT', 'DEVICE_ACK_STOP', 'RESTART_SENT', 'DEVICE_ACK_RESTART', 'DELETE_SENT', 'DEVICE_ACK_DELETE', 'STATUS_CHANGED', 'LIVE_DATA_RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."schedule_operation" AS ENUM('CREATE', 'STOP', 'RESTART', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."device_role" AS ENUM('STANDALONE', 'MASTER', 'CHILD');--> statement-breakpoint
CREATE TABLE "motor_schedule_live_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"motor_id" integer NOT NULL,
	"starter_id" integer,
	"device_start_time" varchar,
	"device_end_time" varchar,
	"device_run_time" integer,
	"device_missed_minutes" integer DEFAULT 0,
	"failure_reason" varchar,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "motor_schedule_live_data_schedule_id_unique" UNIQUE("schedule_id")
);
--> statement-breakpoint
CREATE TABLE "motor_schedule_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"event_type" "schedule_log_event" NOT NULL,
	"actor_type" varchar,
	"actor_id" integer,
	"old_status" varchar,
	"new_status" varchar,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motor_schedule_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"operation" "schedule_operation" NOT NULL,
	"sent_at" timestamp,
	"ack_at" timestamp,
	"ack_status" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "motor_user_id_idx";--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ALTER COLUMN "motor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gateways" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "motor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "role" "device_role" DEFAULT 'STANDALONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "parent_starter_id" integer;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD CONSTRAINT "motor_schedule_live_data_schedule_id_motor_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."motor_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD CONSTRAINT "motor_schedule_live_data_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD CONSTRAINT "motor_schedule_live_data_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_logs" ADD CONSTRAINT "motor_schedule_logs_schedule_id_motor_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."motor_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_operations" ADD CONSTRAINT "motor_schedule_operations_schedule_id_motor_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."motor_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "msl_schedule_id_idx" ON "motor_schedule_logs" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "msl_created_at_idx" ON "motor_schedule_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mso_schedule_id_idx" ON "motor_schedule_operations" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "mso_schedule_op_idx" ON "motor_schedule_operations" USING btree ("schedule_id","operation");--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_parent_starter_id_starter_boxes_id_fk" FOREIGN KEY ("parent_starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "motor_created_by_idx" ON "motors" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "starter_box_role_idx" ON "starter_boxes" USING btree ("role");--> statement-breakpoint
CREATE INDEX "starter_box_parent_starter_id_idx" ON "starter_boxes" USING btree ("parent_starter_id");--> statement-breakpoint
CREATE INDEX "motor_user_id_idx" ON "motors" USING btree ("user_id");