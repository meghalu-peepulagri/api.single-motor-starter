ALTER TABLE "device_status_history" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "motor_status_history" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "power_status_history" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;