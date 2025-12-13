CREATE TABLE "alerts_faults" (
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
ALTER TABLE "motors_run_time" RENAME COLUMN "motor_description" TO "motor_mode";--> statement-breakpoint
CREATE INDEX "alertsFaultsStarterMotorTimeDescIdx" ON "alerts_faults" USING btree ("starter_id","motor_id","timestamp" desc);--> statement-breakpoint
CREATE INDEX "alertsFaultsFaultFilterIdx" ON "alerts_faults" USING btree ("fault_code","fault_description") WHERE "alerts_faults"."fault_code" IS NOT NULL 
  AND "alerts_faults"."fault_code" <> 0
  AND "alerts_faults"."fault_description" IS NOT NULL
  AND "alerts_faults"."fault_description" NOT IN ('Unknown Fault','No Fault')
;--> statement-breakpoint
CREATE INDEX "alertsFaultsAlertFilterIdx" ON "alerts_faults" USING btree ("alert_code","alert_description") WHERE "alerts_faults"."alert_code" IS NOT NULL 
  AND "alerts_faults"."alert_code" <> 0
  AND "alerts_faults"."alert_description" IS NOT NULL
  AND "alerts_faults"."alert_description" NOT IN ('Unknown Alert','No Alert')
;--> statement-breakpoint
ALTER TABLE "motors_run_time" DROP COLUMN "starter_mode";