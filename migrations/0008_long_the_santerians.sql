CREATE TYPE "public"."test_run_status" AS ENUM('IN_TEST', 'COMPLETED', 'FAILED');--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "test_run_status" "test_run_status" DEFAULT 'IN_TEST';--> statement-breakpoint
CREATE INDEX "motor_test_run_status_idx" ON "motors" USING btree ("test_run_status");