CREATE TABLE "benched_starter_parameters" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload_version" varchar NOT NULL,
	"packet_number" integer DEFAULT 0 NOT NULL,
	"line_voltage_r" real DEFAULT 0 NOT NULL,
	"line_voltage_s" real DEFAULT 0 NOT NULL,
	"line_voltage_b" real DEFAULT 0 NOT NULL,
	"avg_voltage" real DEFAULT 0 NOT NULL,
	"current_r" real DEFAULT 0 NOT NULL,
	"current_s" real DEFAULT 0 NOT NULL,
	"current_b" real DEFAULT 0 NOT NULL,
	"avg_current" real DEFAULT 0 NOT NULL,
	"power_present" integer NOT NULL,
	"motor_mode" integer NOT NULL,
	"mode_description" varchar NOT NULL,
	"motor_state" integer NOT NULL,
	"motor_description" varchar NOT NULL,
	"alert" integer NOT NULL,
	"alert_description" varchar NOT NULL,
	"fault" integer NOT NULL,
	"fault_description" varchar NOT NULL,
	"last_on_code" integer NOT NULL,
	"last_on_description" varchar NOT NULL,
	"last_off_code" integer NOT NULL,
	"last_off_description" varchar NOT NULL,
	"time_stamp" varchar NOT NULL,
	"starter_id" integer NOT NULL,
	"motor_id" integer NOT NULL,
	"gateway_id" integer,
	"user_id" integer NOT NULL,
	"payload_valid" boolean DEFAULT false NOT NULL,
	"payload_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ADD CONSTRAINT "benched_starter_parameters_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ADD CONSTRAINT "benched_starter_parameters_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ADD CONSTRAINT "benched_starter_parameters_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benched_starter_parameters" ADD CONSTRAINT "benched_starter_parameters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benched_starter_params_starter_id_idx" ON "benched_starter_parameters" USING btree ("starter_id");--> statement-breakpoint
CREATE INDEX "benched_starter_params_motor_id_idx" ON "benched_starter_parameters" USING btree ("motor_id");--> statement-breakpoint
CREATE INDEX "benched_starter_params_starter_motor_idx" ON "benched_starter_parameters" USING btree ("motor_id","starter_id");