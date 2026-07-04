CREATE TABLE "sub_user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sub_user_id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"starter_id" integer,
	"motor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parent_id" integer DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "sub_user_permissions" ADD CONSTRAINT "sub_user_permissions_sub_user_id_users_id_fk" FOREIGN KEY ("sub_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_user_permissions" ADD CONSTRAINT "sub_user_permissions_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_user_permissions" ADD CONSTRAINT "sub_user_permissions_starter_id_starter_boxes_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starter_boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_user_permissions" ADD CONSTRAINT "sub_user_permissions_motor_id_motors_id_fk" FOREIGN KEY ("motor_id") REFERENCES "public"."motors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_sub_user_perm" ON "sub_user_permissions" USING btree ("sub_user_id","parent_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;