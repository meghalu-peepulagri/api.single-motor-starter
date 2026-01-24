-- CREATE TYPE "public"."device_token_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
-- CREATE TYPE "public"."schedule_type" AS ENUM('ONE_TIME', 'DAILY', 'WEEKLY');--> statement-breakpoint
-- CREATE TYPE "public"."schedule_status" AS ENUM('PENDING', 'RUNNING', 'SCHEDULED', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'RESCHEDULED');--> statement-breakpoint
-- CREATE TYPE "public"."mode_enum" AS ENUM('MANUAL', 'AUTO');--> statement-breakpoint
-- CREATE TYPE "public"."device_status" AS ENUM('ASSIGNED', 'DEPLOYED', 'READY', 'TEST');--> statement-breakpoint
-- CREATE TYPE "public"."starter_type" AS ENUM('SINGLE_STARTER', 'MULTI_STARTER');--> statement-breakpoint
-- CREATE TYPE "public"."acknowledgement_enum" AS ENUM('TRUE', 'FALSE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts_faults" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer,
	"motor_id" integer,
	"alert_code" integer,
	"alert_description" varchar,
	"fault_code" integer,
	"fault_description" varchar,
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
	"hardware_version" varchar,
	"temperature" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"assigned_at" timestamp,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "starter_default_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"allflt_en" integer DEFAULT 0,
	"flc" real DEFAULT 1.65,
	"as_dly" integer DEFAULT 5,
	"pr_flt_en" integer DEFAULT 0,
	"tpf" real DEFAULT 0,
	"v_en" integer DEFAULT 0,
	"c_en" integer DEFAULT 0,
	"ipf" real DEFAULT 0,
	"lvf" real DEFAULT 300,
	"hvf" real DEFAULT 480,
	"vif" real DEFAULT 5,
	"paminf" real DEFAULT 100,
	"pamaxf" real DEFAULT 125,
	"f_dr" real DEFAULT 10,
	"f_ol" real DEFAULT 120,
	"f_lr" real DEFAULT 350,
	"f_opf" real DEFAULT 0.5,
	"f_ci" real DEFAULT 15,
	"pfa" real DEFAULT 280,
	"lva" real DEFAULT 340,
	"hva" real DEFAULT 470,
	"via" real DEFAULT 10,
	"pamina" real DEFAULT 100,
	"pamaxa" real DEFAULT 125,
	"dr" real DEFAULT 10,
	"ol" real DEFAULT 110,
	"lr" real DEFAULT 300,
	"ci" real DEFAULT 15,
	"lvr" real DEFAULT 360,
	"hvr" real DEFAULT 450,
	"olf" real DEFAULT 1,
	"lrf" real DEFAULT 1,
	"opf" real DEFAULT 0.5,
	"cif" real DEFAULT 0.5,
	"drf" real DEFAULT 5,
	"lrr" real DEFAULT 10,
	"olr" real DEFAULT 10,
	"cir" real DEFAULT 10,
	"vflt_under_voltage" integer DEFAULT 0,
	"vflt_over_voltage" integer DEFAULT 0,
	"vflt_voltage_imbalance" integer DEFAULT 0,
	"vflt_phase_failure" integer DEFAULT 0,
	"cflt_dry_run" integer DEFAULT 0,
	"cflt_over_current" integer DEFAULT 0,
	"cflt_output_phase_fail" integer DEFAULT 0,
	"cflt_curr_imbalance" integer DEFAULT 0,
	"ug_r" integer DEFAULT 50567,
	"ug_y" integer DEFAULT 49867,
	"ug_b" integer DEFAULT 51078,
	"ip_r" integer DEFAULT 8974,
	"ip_y" integer DEFAULT 8974,
	"ip_b" integer DEFAULT 8974,
	"vg_r" real DEFAULT 0,
	"vg_y" real DEFAULT 0,
	"vg_b" real DEFAULT 0,
	"vo_r" real DEFAULT 0,
	"vo_y" real DEFAULT 0,
	"vo_b" real DEFAULT 0,
	"ig_r" real DEFAULT 0,
	"ig_y" real DEFAULT 0,
	"ig_b" real DEFAULT 0,
	"io_r" real DEFAULT 0,
	"io_y" real DEFAULT 0,
	"io_b" real DEFAULT 0,
	"r1" integer DEFAULT 0,
	"r2" integer DEFAULT 0,
	"off" integer DEFAULT 0,
	"ca_fn" varchar(100) DEFAULT '',
	"bkr_adrs" varchar(100) DEFAULT '',
	"sn" varchar(50) DEFAULT '',
	"usrn" varchar(50) DEFAULT '',
	"pswd" varchar(50) DEFAULT '',
	"prd_url" varchar(100) DEFAULT '',
	"port" integer DEFAULT 1883,
	"crt_en" integer DEFAULT 2048,
	"sms_pswd" varchar(20) DEFAULT '',
	"c_lang" integer DEFAULT 1,
	"auth_num" varchar(10)[],
	"dft_liv_f" integer DEFAULT 5,
	"h_liv_f" integer DEFAULT 2,
	"m_liv_f" integer DEFAULT 4,
	"l_liv_f" integer DEFAULT 3,
	"pwr_info_f" integer DEFAULT 20,
	"ivrs_en" integer DEFAULT 0,
	"sms_en" integer DEFAULT 0,
	"rmt_en" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
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
CREATE TABLE IF NOT EXISTS "starter_settings_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer NOT NULL,
	"pr_flt_en_min" integer DEFAULT 0,
	"pr_flt_en_max" integer DEFAULT 65355,
	"flc_min" real DEFAULT 1,
	"flc_max" real DEFAULT 10,
	"as_dly_min" integer DEFAULT 5,
	"as_dly_max" integer,
	"tpf_min" real DEFAULT 0,
	"tpf_max" real DEFAULT 10,
	"v_en" integer DEFAULT 0,
	"c_en" integer DEFAULT 0,
	"ipf_min" real DEFAULT 0,
	"ipf_max" real DEFAULT 300,
	"lvf_min" real DEFAULT 300,
	"lvf_max" real DEFAULT 380,
	"hvf_min" real DEFAULT 480,
	"hvf_max" real DEFAULT 550,
	"vif_min" real DEFAULT 5,
	"vif_max" real DEFAULT 30,
	"paminf_min" real DEFAULT 100,
	"paminf_max" real DEFAULT 110,
	"pamaxf_min" real DEFAULT 125,
	"pamaxf_max" real DEFAULT 130,
	"f_dr_min" real DEFAULT 10,
	"f_dr_max" real DEFAULT 50,
	"f_ol_min" real DEFAULT 120,
	"f_ol_max" real DEFAULT 150,
	"f_lr_min" real DEFAULT 350,
	"f_lr_max" real DEFAULT 450,
	"f_opf" real DEFAULT 0.5,
	"f_ci_min" real DEFAULT 15,
	"f_ci_max" real DEFAULT 35,
	"pfa_min" real DEFAULT 280,
	"pfa_max" real DEFAULT 360,
	"lva_min" real DEFAULT 340,
	"lva_max" real DEFAULT 380,
	"hva_min" real DEFAULT 470,
	"hva_max" real DEFAULT 500,
	"via_min" real DEFAULT 10,
	"via_max" real DEFAULT 20,
	"pamina_min" real DEFAULT 100,
	"pamina_max" real DEFAULT 115,
	"pamaxa_min" real DEFAULT 125,
	"pamaxa_max" real DEFAULT 135,
	"dr_min" real DEFAULT 10,
	"dr_max" real DEFAULT 60,
	"ol_min" real DEFAULT 110,
	"ol_max" real DEFAULT 150,
	"lr_min" real DEFAULT 300,
	"lr_max" real DEFAULT 400,
	"ci_min" real DEFAULT 15,
	"ci_max" real DEFAULT 30,
	"lvr_min" real DEFAULT 360,
	"lvr_max" real DEFAULT 400,
	"hvr_min" real DEFAULT 450,
	"hvr_max" real DEFAULT 470,
	"olf_min" real DEFAULT 1,
	"olf_max" real DEFAULT 9,
	"lrf_min" real DEFAULT 1,
	"lrf_max" real DEFAULT 9,
	"opf_min" real DEFAULT 0.5,
	"opf_max" real DEFAULT 1,
	"cif_min" real DEFAULT 0.5,
	"cif_max" real DEFAULT 1,
	"drf_min" real DEFAULT 5,
	"drf_max" real DEFAULT 20,
	"irr_min" real DEFAULT 10,
	"irr_max" real DEFAULT 50,
	"olr_min" real DEFAULT 10,
	"olr_max" real DEFAULT 50,
	"cir_min" real DEFAULT 10,
	"cir_max" real DEFAULT 50,
	"ug_r_min" real DEFAULT 1,
	"ug_r_max" real DEFAULT 65536,
	"ug_y_min" real DEFAULT 1,
	"ug_y_max" real DEFAULT 65536,
	"ug_b_min" real DEFAULT 1,
	"ug_b_max" real DEFAULT 65536,
	"ip_r_min" real DEFAULT 1,
	"ip_r_max" real DEFAULT 65536,
	"ip_y_min" real DEFAULT 1,
	"ip_y_max" real DEFAULT 65536,
	"ip_b_min" real DEFAULT 1,
	"ip_b_max" real DEFAULT 65536,
	"vg_r_min" real DEFAULT 0,
	"vg_r_max" real DEFAULT 0,
	"vg_y_min" real DEFAULT 0,
	"vg_y_max" real DEFAULT 0,
	"vg_b_min" real DEFAULT 0,
	"vg_b_max" real DEFAULT 0,
	"vo_r_min" real DEFAULT 0,
	"vo_r_max" real DEFAULT 0,
	"vo_y_min" real DEFAULT 0,
	"vo_y_max" real DEFAULT 0,
	"vo_b_min" real DEFAULT 0,
	"vo_b_max" real DEFAULT 0,
	"ig_r_min" real DEFAULT 1,
	"ig_r_max" real DEFAULT 65536,
	"ig_y_min" real DEFAULT 1,
	"ig_y_max" real DEFAULT 65536,
	"ig_b_min" real DEFAULT 1,
	"ig_b_max" real DEFAULT 65536,
	"io_r_min" real DEFAULT 0,
	"io_r_max" real DEFAULT 0,
	"io_y_min" real DEFAULT 0,
	"io_y_max" real DEFAULT 0,
	"io_b_min" real DEFAULT 0,
	"io_b_max" real DEFAULT 0,
	"r1" integer DEFAULT 0,
	"r2" integer DEFAULT 0,
	"off" integer DEFAULT 0,
	"ca_fn" varchar(100),
	"bkr_adrs" varchar(100),
	"sn" varchar(50),
	"usrn" varchar(50),
	"pswd" varchar(50),
	"prd_url" varchar(100),
	"port" integer DEFAULT 1883,
	"crt_en" integer DEFAULT 2048,
	"sms_pswd" varchar(20),
	"c_lang" integer DEFAULT 1,
	"auth_num" varchar(15)[],
	"dft_liv_f" integer DEFAULT 5,
	"h_liv_f" integer DEFAULT 2,
	"m_liv_f" integer DEFAULT 4,
	"l_liv_f" integer DEFAULT 3,
	"pwr_info_f" integer DEFAULT 20,
	"ivrs_en" integer DEFAULT 0,
	"sms_en" integer DEFAULT 0,
	"rmt_en" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "starter_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"starter_id" integer NOT NULL,
	"allflt_en" integer DEFAULT 0,
	"flc" real DEFAULT 1.65,
	"as_dly" integer DEFAULT 5,
	"pr_flt_en" integer DEFAULT 0,
	"tpf" real DEFAULT 0,
	"v_en" integer DEFAULT 0,
	"c_en" integer DEFAULT 0,
	"ipf" real DEFAULT 0,
	"lvf" real DEFAULT 300,
	"hvf" real DEFAULT 480,
	"vif" real DEFAULT 5,
	"paminf" real DEFAULT 100,
	"pamaxf" real DEFAULT 125,
	"f_dr" real DEFAULT 10,
	"f_ol" real DEFAULT 120,
	"f_lr" real DEFAULT 350,
	"f_opf" real DEFAULT 0.5,
	"f_ci" real DEFAULT 15,
	"pfa" real DEFAULT 280,
	"lva" real DEFAULT 340,
	"hva" real DEFAULT 470,
	"via" real DEFAULT 10,
	"pamina" real DEFAULT 100,
	"pamaxa" real DEFAULT 125,
	"dr" real DEFAULT 10,
	"ol" real DEFAULT 110,
	"lr" real DEFAULT 300,
	"ci" real DEFAULT 15,
	"lvr" real DEFAULT 360,
	"hvr" real DEFAULT 450,
	"olf" real DEFAULT 1,
	"lrf" real DEFAULT 1,
	"opf" real DEFAULT 0.5,
	"cif" real DEFAULT 0.5,
	"drf" real DEFAULT 5,
	"olr" real DEFAULT 10,
	"lrr" real DEFAULT 10,
	"cir" real DEFAULT 10,
	"vflt_under_voltage" integer DEFAULT 0,
	"vflt_over_voltage" integer DEFAULT 0,
	"vflt_voltage_imbalance" integer DEFAULT 0,
	"vflt_phase_failure" integer DEFAULT 0,
	"cflt_dry_run" integer DEFAULT 0,
	"cflt_over_current" integer DEFAULT 0,
	"cflt_output_phase_fail" integer DEFAULT 0,
	"cflt_curr_imbalance" integer DEFAULT 0,
	"ug_r" integer DEFAULT 50567,
	"ug_y" integer DEFAULT 49867,
	"ug_b" integer DEFAULT 51078,
	"ip_r" integer DEFAULT 8974,
	"ip_y" integer DEFAULT 8974,
	"ip_b" integer DEFAULT 8974,
	"vg_r" real DEFAULT 0,
	"vg_y" real DEFAULT 0,
	"vg_b" real DEFAULT 0,
	"vo_r" real DEFAULT 0,
	"vo_y" real DEFAULT 0,
	"vo_b" real DEFAULT 0,
	"ig_r" real DEFAULT 0,
	"ig_y" real DEFAULT 0,
	"ig_b" real DEFAULT 0,
	"io_r" real DEFAULT 0,
	"io_y" real DEFAULT 0,
	"io_b" real DEFAULT 0,
	"r1" integer DEFAULT 0,
	"r2" integer DEFAULT 0,
	"off" integer DEFAULT 0,
	"ca_fn" varchar(100) DEFAULT '',
	"bkr_adrs" varchar(100) DEFAULT '',
	"sn" varchar(50) DEFAULT '',
	"usrn" varchar(50) DEFAULT '',
	"pswd" varchar(50) DEFAULT '',
	"prd_url" varchar(100) DEFAULT '',
	"port" integer DEFAULT 1883,
	"crt_en" integer DEFAULT 2048,
	"sms_pswd" varchar(20) DEFAULT '',
	"c_lang" integer DEFAULT 1,
	"auth_num" varchar(10)[],
	"dft_liv_f" integer DEFAULT 5,
	"h_liv_f" integer DEFAULT 2,
	"m_liv_f" integer DEFAULT 4,
	"l_liv_f" integer DEFAULT 3,
	"pwr_info_f" integer DEFAULT 20,
	"ivrs_en" integer DEFAULT 0,
	"sms_en" integer DEFAULT 0,
	"rmt_en" integer DEFAULT 0,
	"time_stamp" timestamp DEFAULT now(),
	"is_new_configuration_saved" integer DEFAULT 1,
	"acknowledgement" "acknowledgement_enum" DEFAULT 'FALSE',
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"performed_by" integer NOT NULL,
	"action" varchar NOT NULL,
	"entity_type" varchar NOT NULL,
	"entity_id" integer,
	"device_id" integer,
	"old_data" text,
	"new_data" text,
	"message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar NOT NULL,
	"email" varchar,
	"phone" varchar NOT NULL,
	"alternate_phone_1" varchar,
	"alternate_phone_2" varchar,
	"alternate_phone_3" varchar,
	"alternate_phone_4" varchar,
	"alternate_phone_5" varchar,
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
-- ALTER TABLE "alerts_faults" ADD CONSTRAINT "alerts_faults_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "alerts_faults" ADD CONSTRAINT "alerts_faults_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "alerts_faults" ADD CONSTRAINT "alerts_faults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "device_run_time" ADD CONSTRAINT "device_run_time_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "device_run_time" ADD CONSTRAINT "device_run_time_starter_box_id_starter_boxes_id_fk" FOREIGN KEY ("starter_box_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "device_run_time" ADD CONSTRAINT "device_run_time_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "fields" ADD CONSTRAINT "fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "fields" ADD CONSTRAINT "fields_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "gateways" ADD CONSTRAINT "gateways_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "gateways" ADD CONSTRAINT "gateways_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "gateways" ADD CONSTRAINT "gateways_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_starter_box_id_starter_boxes_id_fk" FOREIGN KEY ("starter_box_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motors_run_time" ADD CONSTRAINT "motors_run_time_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motor_schedules" ADD CONSTRAINT "motor_schedules_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motors" ADD CONSTRAINT "motors_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motors" ADD CONSTRAINT "motors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "motors" ADD CONSTRAINT "motors_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_boxes" ADD CONSTRAINT "starter_boxes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_parameters" ADD CONSTRAINT "starter_parameters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_settings_limits" ADD CONSTRAINT "starter_settings_limits_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_settings" ADD CONSTRAINT "starter_settings_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "starter_settings" ADD CONSTRAINT "starter_settings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_device_id_starter_boxes_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "field_user_id_idx" ON "fields" USING btree ("created_by");--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "starter_settings_limits_idx" ON "starter_settings_limits" USING btree ("starter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "starter_settings_idx" ON "starter_settings" USING btree ("starter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_id_logs_idx" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_idx" ON "user_activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_mail_idx" ON "users" USING btree ("email") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_phone_idx" ON "users" USING btree ("phone") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_alt_phone_1_idx" ON "users" USING btree ("alternate_phone_1") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_alt_phone_2_idx" ON "users" USING btree ("alternate_phone_2") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_alt_phone_3_idx" ON "users" USING btree ("alternate_phone_3") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_alt_phone_4_idx" ON "users" USING btree ("alternate_phone_4") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_alt_phone_5_idx" ON "users" USING btree ("alternate_phone_5") WHERE "users"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valid_user" ON "users" USING btree ("email","phone") WHERE "users"."status" != 'ARCHIVED';