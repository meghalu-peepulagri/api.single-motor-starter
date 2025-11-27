CREATE TYPE "public"."device_token_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_token" varchar NOT NULL,
	"user_id" integer,
	"status" "device_token_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "otps" (
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
CREATE TABLE "user_activity_logs" (
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
CREATE TABLE "users" (
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
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deviceTokenIdx" ON "device_tokens" USING btree ("device_token");--> statement-breakpoint
CREATE UNIQUE INDEX "validDeviceTokenIdx" ON "device_tokens" USING btree ("device_token","user_id") WHERE "device_tokens"."status" != 'INACTIVE';--> statement-breakpoint
CREATE INDEX "location_name_idx" ON "locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_status_idx" ON "locations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_location_per_user" ON "locations" USING btree (lower("name"),"user_id") WHERE "locations"."status" != 'ARCHIVED';--> statement-breakpoint
CREATE INDEX "otpPhoneIdx" ON "otps" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "user_id_logs_idx" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "user_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_mail_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "valid_user" ON "users" USING btree ("email","phone") WHERE "users"."status" != 'ARCHIVED';