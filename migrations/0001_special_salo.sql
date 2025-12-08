CREATE TYPE "public"."mode_enum" AS ENUM('LOCAL', 'AUTO');--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "mode" "mode_enum" DEFAULT 'AUTO' NOT NULL;