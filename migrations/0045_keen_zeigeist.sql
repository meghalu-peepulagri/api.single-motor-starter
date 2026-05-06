ALTER TABLE "motors" ADD COLUMN "motor_last_on_at" timestamp;--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "motor_last_off_at" timestamp;--> statement-breakpoint
ALTER TABLE "motors" ADD COLUMN "last_mode_change_at" timestamp;--> statement-breakpoint
ALTER TABLE "starter_boxes" ADD COLUMN "last_signal_received_at" timestamp;