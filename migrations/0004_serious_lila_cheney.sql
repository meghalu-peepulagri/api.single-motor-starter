ALTER TABLE "starter_settings" RENAME COLUMN "clr" TO "cir";--> statement-breakpoint
ALTER TABLE "starter_default_settings" ADD COLUMN "cir" real DEFAULT 10;