CREATE TYPE "public"."schedule_log_event" AS ENUM('CREATED', 'SENT_TO_DEVICE', 'DEVICE_ACK_CREATE', 'RESENT', 'STOP_SENT', 'DEVICE_ACK_STOP', 'RESTART_SENT', 'DEVICE_ACK_RESTART', 'DELETE_SENT', 'DEVICE_ACK_DELETE', 'STATUS_CHANGED', 'LIVE_DATA_RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."schedule_operation" AS ENUM('CREATE', 'STOP', 'RESTART', 'DELETE');--> statement-breakpoint
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
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
DROP TYPE "public"."schedule_status";--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('PENDING', 'SCHEDULED', 'RUNNING', 'STOPPED', 'COMPLETED', 'PARTIAL', 'MISSED', 'UNDELIVERED', 'FAILED', 'DELETED', 'RESTARTED', 'WAITING_NEXT_CYCLE');--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DEFAULT 'PENDING'::"public"."schedule_status";--> statement-breakpoint
ALTER TABLE "motor_schedules" ALTER COLUMN "schedule_status" SET DATA TYPE "public"."schedule_status" USING "schedule_status"::"public"."schedule_status";--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_start_time" varchar;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_end_time" varchar;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_run_time" integer;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_missed_minutes" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_failure_at" timestamp;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_failure_reason" varchar;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD COLUMN "device_last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD CONSTRAINT "motor_schedule_live_data_schedule_id_motor_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."motor_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD CONSTRAINT "motor_schedule_live_data_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_live_data" ADD CONSTRAINT "motor_schedule_live_data_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_logs" ADD CONSTRAINT "motor_schedule_logs_schedule_id_motor_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."motor_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedule_operations" ADD CONSTRAINT "motor_schedule_operations_schedule_id_motor_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."motor_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "msl_schedule_id_idx" ON "motor_schedule_logs" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "msl_created_at_idx" ON "motor_schedule_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mso_schedule_id_idx" ON "motor_schedule_operations" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "mso_schedule_op_idx" ON "motor_schedule_operations" USING btree ("schedule_id","operation");