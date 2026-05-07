ALTER TABLE "benched_starter_parameters" ALTER COLUMN "motor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gateways" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "starter_parameters" ALTER COLUMN "motor_id" DROP NOT NULL;