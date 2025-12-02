CREATE TYPE "public"."device_token_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."mode_enum" AS ENUM('LOCAL+MANUAL', 'REMOTE+MANUAL', 'LOCAL+AUTO', 'REMOTE+AUTO');--> statement-breakpoint
CREATE TABLE  IF NOT EXISTS  "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_token" varchar NOT NULL,
	"user_id" integer,
	"status" "device_token_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE  IF NOT EXISTS "fields" (
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
CREATE TABLE  IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"user_id" integer NOT NULL,
	"created_by" integer,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE  IF NOT EXISTS "motors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"hp" integer NOT NULL,
	"field_id" integer,
	"state" integer DEFAULT 0 NOT NULL,
	"mode" "mode_enum" DEFAULT 'LOCAL+AUTO' NOT NULL,
	"created_by" integer NOT NULL,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE  IF NOT EXISTS "otps" (
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
CREATE TABLE  IF NOT EXISTS "user_activity_logs" (
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
CREATE TABLE  IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar NOT NULL,
	"user_type" "user_type" DEFAULT 'USER',
	"password" varchar,
	"address" varchar,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_by" integer,
	"user_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motors" ADD CONSTRAINT "motors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "deviceTokenIdx" ON "device_tokens" USING btree ("device_token");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "validDeviceTokenIdx" ON "device_tokens" USING btree ("device_token","user_id") WHERE "device_tokens"."status" != 'INACTIVE';--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "filed_user_id_idx" ON "fields" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "location_id_idx" ON "fields" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "field_status_idx" ON "fields" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "unique_field_per_user_location" ON "fields" USING btree (lower("name"),"location_id","created_by") WHERE "fields"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "location_name_idx" ON "locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "user_id_idx" ON "locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "location_status_idx" ON "locations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "unique_location_per_user" ON "locations" USING btree (lower("name"),"user_id") WHERE "locations"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "motor_user_id_idx" ON "motors" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "motor_idx" ON "motors" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "unique_motor_per_field" ON "motors" USING btree (lower("name"),"field_id") WHERE "motors"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "otpPhoneIdx" ON "otps" USING btree ("phone");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "user_id_logs_idx" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX  IF NOT EXISTS "user_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "unique_mail_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "unique_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX  IF NOT EXISTS "valid_user" ON "users" USING btree ("email","phone") WHERE "users"."status" != 'ARCHIVED';