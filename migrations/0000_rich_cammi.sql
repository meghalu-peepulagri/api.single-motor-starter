CREATE TYPE "public"."device_token_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."schedule_type" AS ENUM('ONE_TIME', 'DAILY', 'WEEKLY');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('PENDING', 'RUNNING', 'SCHEDULED', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."mode_enum" AS ENUM('MANUAL', 'AUTO');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('ASSIGNED', 'DEPLOYED', 'READY', 'TEST');--> statement-breakpoint
CREATE TYPE "public"."starter_type" AS ENUM('SINGLE_STARTER', 'MULTI_STARTER');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts_faults" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer,
	"motor_id" integer,
	"alert_code" integer,
	"alert_description" text,
	"fault_code" integer,
	"fault_description" text,
	"timestamp" timestamp,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_run_time" (
	"id" serial PRIMARY KEY NOT NULL,
	"motor_id" integer,
	"starter_box_id" integer,
	"location_id" integer,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration" varchar,
	"motor_state" integer,
	"motor_mode" varchar,
	"power_state" integer,
	"signal_strength" integer,
	"time_stamp" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_token" varchar NOT NULL,
	"user_id" integer,
	"status" "device_token_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fields" (
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
CREATE TABLE IF NOT EXISTS "gateways" (
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
CREATE TABLE IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"user_id" integer NOT NULL,
	"created_by" integer,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motors_run_time" (
	"id" serial PRIMARY KEY NOT NULL,
	"motor_id" integer,
	"starter_box_id" integer,
	"location_id" integer,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration" varchar,
	"motor_state" integer,
	"motor_mode" varchar,
	"time_stamp" varchar,
	"power_start" varchar,
	"power_end" varchar,
	"power_state" integer,
	"power_duration" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motor_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"pond_id" integer NOT NULL,
	"motor_id" integer NOT NULL,
	"schedule_type" "schedule_type" DEFAULT 'ONE_TIME' NOT NULL,
	"schedule_date" varchar,
	"days_of_week" integer[] DEFAULT '{}'::integer[],
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"schedule_status" "schedule_status" DEFAULT 'PENDING' NOT NULL,
	"acknowledgement" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"alias_name" varchar,
	"hp" numeric(10, 2) NOT NULL,
	"location_id" integer,
	"state" integer DEFAULT 0 NOT NULL,
	"mode" "mode_enum" DEFAULT 'AUTO' NOT NULL,
	"created_by" integer,
	"starter_id" integer,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"assigned_at" timestamp,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar NOT NULL,
	"action" varchar NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"otp" varchar NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "starter_boxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar,
	"alias_name" varchar,
	"mac_address" varchar,
	"pcb_number" varchar,
	"starter_number" varchar NOT NULL,
	"status" "status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"power" integer DEFAULT 0 NOT NULL,
	"user_id" integer,
	"created_by" integer NOT NULL,
	"device_status" "device_status" DEFAULT 'READY' NOT NULL,
	"gateway_id" integer,
	"location_id" integer,
	"signal_quality" integer DEFAULT 0 NOT NULL,
	"network_type" varchar DEFAULT 'NUll' NOT NULL,
	"starter_type" "starter_type" DEFAULT 'SINGLE_STARTER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"assigned_at" timestamp,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "starter_parameters" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload_version" varchar NOT NULL,
	"packet_number" integer DEFAULT 0 NOT NULL,
	"line_voltage_r" real DEFAULT 0 NOT NULL,
	"line_voltage_s" real DEFAULT 0 NOT NULL,
	"line_voltage_b" real DEFAULT 0 NOT NULL,
	"avg_voltage" real DEFAULT 0 NOT NULL,
	"current_r" real DEFAULT 0 NOT NULL,
	"current_s" real DEFAULT 0 NOT NULL,
	"current_b" real DEFAULT 0 NOT NULL,
	"avg_current" real DEFAULT 0 NOT NULL,
	"power_present" integer NOT NULL,
	"motor_mode" integer NOT NULL,
	"mode_description" varchar NOT NULL,
	"motor_state" integer NOT NULL,
	"motor_description" varchar NOT NULL,
	"alert" integer NOT NULL,
	"alert_description" varchar NOT NULL,
	"fault" integer NOT NULL,
	"fault_description" varchar NOT NULL,
	"last_on_code" integer NOT NULL,
	"last_on_description" varchar NOT NULL,
	"last_off_code" integer NOT NULL,
	"last_off_description" varchar NOT NULL,
	"time_stamp" varchar NOT NULL,
	"starter_id" integer NOT NULL,
	"motor_id" integer NOT NULL,
	"gateway_id" integer,
	"user_id" integer NOT NULL,
	"payload_valid" boolean DEFAULT false NOT NULL,
	"payload_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_name" varchar,
	"user_id" integer NOT NULL,
	"action" varchar NOT NULL,
	"performed_by" integer NOT NULL,
	"old_data" varchar,
	"new_data" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar NOT NULL,
	"email" varchar,
	"phone" varchar NOT NULL,
	"user_type" "user_type" DEFAULT 'USER',
	"password" varchar,
	"address" varchar,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_by" integer DEFAULT NULL,
	"referred_by" integer DEFAULT NULL,
	"notifications_enabled" jsonb DEFAULT '[]'::jsonb,
	"user_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "alerts_faults" ADD CONSTRAINT "alerts_faults_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_faults" ADD CONSTRAINT "alerts_faults_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_faults" ADD CONSTRAINT "alerts_faults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_run_time" ADD CONSTRAINT "device_run_time_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_run_time" ADD CONSTRAINT "device_run_time_starter_box_id_starter_boxes_id_fk" FOREIGN KEY ("starter_box_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_run_time" ADD CONSTRAINT "device_run_time_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_starter_box_id_starter_boxes_id_fk" FOREIGN KEY ("starter_box_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD CONSTRAINT "motor_schedules_pond_id_fields_id_fk" FOREIGN KEY ("pond_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motor_schedules" ADD CONSTRAINT "motor_schedules_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_faults_starter_motor_time_desc_idx" ON "alerts_faults" USING btree ("starter_id","motor_id","timestamp" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_faults_fault_filter_idx" ON "alerts_faults" USING btree ("fault_code","fault_description") WHERE 
      "alerts_faults"."fault_code" IS NOT NULL
      AND "alerts_faults"."fault_code" <> 0
      AND "alerts_faults"."fault_description" IS NOT NULL
      AND "alerts_faults"."fault_description" NOT IN ('Unknown Fault', 'No Fault')
    ;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_faults_alert_filter_idx" ON "alerts_faults" USING btree ("alert_code","alert_description") WHERE 
      "alerts_faults"."alert_code" IS NOT NULL
      AND "alerts_faults"."alert_code" <> 0
      AND "alerts_faults"."alert_description" IS NOT NULL
      AND "alerts_faults"."alert_description" NOT IN ('Unknown Alert', 'No Alert')
    ;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_run_time_motor_id_idx" ON "device_run_time" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_run_time_starter_box_id_idx" ON "device_run_time" USING btree ("starter_box_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_token_idx" ON "device_tokens" USING btree ("device_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valid_device_token_idx" ON "device_tokens" USING btree ("device_token","user_id") WHERE "device_tokens"."status" <> 'INACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filed_user_id_idx" ON "fields" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_id_idx" ON "fields" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_status_idx" ON "fields" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_field_per_user" ON "fields" USING btree ("created_by","id") WHERE "fields"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_field_per_user_location" ON "fields" USING btree (lower("name"),"location_id","created_by") WHERE "fields"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_idx" ON "gateways" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_user_id_idx" ON "gateways" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_location_id_idx" ON "gateways" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_name_idx" ON "locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_id_idx" ON "locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_status_idx" ON "locations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_location_per_user" ON "locations" USING btree (lower("name"),"user_id") WHERE "locations"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motors_run_time_motor_id_idx" ON "motors_run_time" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motors_run_time_starter_box_id_idx" ON "motors_run_time" USING btree ("starter_box_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motor_schedule_motor_id_idx" ON "motor_schedules" USING btree ("motor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "motor_schedule_unique_idx" ON "motor_schedules" USING btree ("motor_id","schedule_type","start_time","end_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motor_user_id_idx" ON "motors" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motor_idx" ON "motors" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motor_alias_name_idx" ON "motors" USING btree ("alias_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_phone_idx" ON "otps" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_id_idx" ON "starter_boxes" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_user_id_idx" ON "starter_boxes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_status_idx" ON "starter_boxes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_device_status_idx" ON "starter_boxes" USING btree ("device_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_pcb_number_idx" ON "starter_boxes" USING btree ("pcb_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_mac_address_idx" ON "starter_boxes" USING btree ("mac_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_starter_number_idx" ON "starter_boxes" USING btree ("starter_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_location_id_idx" ON "starter_boxes" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_box_power_idx" ON "starter_boxes" USING btree ("power");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valid_starter_box_name" ON "starter_boxes" USING btree (lower("name")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "validate_mac_address" ON "starter_boxes" USING btree (lower("mac_address")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "validate_pcb_number" ON "starter_boxes" USING btree (lower("pcb_number")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "validate_starter_number" ON "starter_boxes" USING btree (lower("starter_number")) WHERE "starter_boxes"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_params_starter_id_idx" ON "starter_parameters" USING btree ("starter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_params_motor_id_idx" ON "starter_parameters" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_params_starter_motor_idx" ON "starter_parameters" USING btree ("motor_id","starter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_id_logs_idx" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_mail_idx" ON "users" USING btree ("email") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_phone_idx" ON "users" USING btree ("phone") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valid_user" ON "users" USING btree ("email","phone") WHERE "users"."status" != 'ARCHIVED';