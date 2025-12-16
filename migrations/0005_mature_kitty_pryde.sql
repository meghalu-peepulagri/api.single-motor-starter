DROP INDEX "alertsFaultsStarterMotorTimeDescIdx";--> statement-breakpoint
DROP INDEX "alertsFaultsFaultFilterIdx";--> statement-breakpoint
DROP INDEX "alertsFaultsAlertFilterIdx";--> statement-breakpoint
DROP INDEX "deviceMotorIdxRunTime";--> statement-breakpoint
DROP INDEX "deviceIdxRunTime";--> statement-breakpoint
DROP INDEX "deviceTokenIdx";--> statement-breakpoint
DROP INDEX "validDeviceTokenIdx";--> statement-breakpoint
DROP INDEX "motorIdxRunTime";--> statement-breakpoint
DROP INDEX "starterBoxIdxRunTime";--> statement-breakpoint
DROP INDEX "pondIdxRunTime";--> statement-breakpoint
DROP INDEX "motorScheduleMotorIdx";--> statement-breakpoint
DROP INDEX "uniqueMotorSchedule";--> statement-breakpoint
DROP INDEX "otpPhoneIdx";--> statement-breakpoint
ALTER TABLE "motors_run_time" ADD COLUMN "time_stamp" varchar;--> statement-breakpoint
CREATE INDEX "alerts_faults_starter_motor_time_desc_idx" ON "alerts_faults" USING btree ("starter_id","motor_id","timestamp" desc);--> statement-breakpoint
CREATE INDEX "alerts_faults_fault_filter_idx" ON "alerts_faults" USING btree ("fault_code","fault_description") WHERE 
      "alerts_faults"."fault_code" IS NOT NULL
      AND "alerts_faults"."fault_code" <> 0
      AND "alerts_faults"."fault_description" IS NOT NULL
      AND "alerts_faults"."fault_description" NOT IN ('Unknown Fault', 'No Fault')
    ;--> statement-breakpoint
CREATE INDEX "alerts_faults_alert_filter_idx" ON "alerts_faults" USING btree ("alert_code","alert_description") WHERE 
      "alerts_faults"."alert_code" IS NOT NULL
      AND "alerts_faults"."alert_code" <> 0
      AND "alerts_faults"."alert_description" IS NOT NULL
      AND "alerts_faults"."alert_description" NOT IN ('Unknown Alert', 'No Alert')
    ;--> statement-breakpoint
CREATE INDEX "device_run_time_motor_id_idx" ON "device_run_time" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX "device_run_time_starter_box_id_idx" ON "device_run_time" USING btree ("starter_box_id");--> statement-breakpoint
CREATE INDEX "device_token_idx" ON "device_tokens" USING btree ("device_token");--> statement-breakpoint
CREATE UNIQUE INDEX "valid_device_token_idx" ON "device_tokens" USING btree ("device_token","user_id") WHERE "device_tokens"."status" <> 'INACTIVE';--> statement-breakpoint
CREATE INDEX "motors_run_time_motor_id_idx" ON "motors_run_time" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX "motors_run_time_starter_box_id_idx" ON "motors_run_time" USING btree ("starter_box_id");--> statement-breakpoint
CREATE INDEX "motor_schedule_motor_id_idx" ON "motor_schedules" USING btree ("motor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "motor_schedule_unique_idx" ON "motor_schedules" USING btree ("motor_id","schedule_type","start_time","end_time");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otps" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "starter_params_motor_id_idx" ON "starter_parameters" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX "starter_params_starter_motor_idx" ON "starter_parameters" USING btree ("motor_id","starter_id");