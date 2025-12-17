ALTER TABLE "users" ALTER COLUMN "created_by" SET DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" integer DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notifications_enabled" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;