CREATE TYPE "public"."status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar NOT NULL,
	"email" varchar,
	"phone" varchar NOT NULL,
	"user_type" "user_type" DEFAULT 'USER',
	"password" varchar,
	"address" varchar,
	"status" "status_enum" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX "emailIdx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "phoneIdx" ON "users" USING btree ("phone");