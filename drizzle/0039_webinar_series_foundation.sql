CREATE TYPE "public"."session_rule" AS ENUM('none', 'attended_or_watched', 'attended');--> statement-breakpoint
CREATE TYPE "public"."relive_access" AS ENUM('registrants', 'learners', 'public');--> statement-breakpoint
ALTER TYPE "public"."media_access" ADD VALUE 'registrants';--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "session_rule" "session_rule" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "catch_up_days" integer;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "evidence" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "recording_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "relive_access" "relive_access" DEFAULT 'registrants' NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "relive_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "relive_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "webinars" ADD CONSTRAINT "webinars_relive_confirmed_by_user_id_fk" FOREIGN KEY ("relive_confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinars" ADD CONSTRAINT "webinars_recording_fk" FOREIGN KEY ("tenant_id","recording_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Credentials issued before say what they rest on, from how they were earned.
-- Imported ones keep none: the other platform did not tell us. Row-level
-- security is forced on credentials, so the owner lifts it for the backfill.
ALTER TABLE "credentials" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "credentials" SET "evidence" = CASE "basis"
  WHEN 'work' THEN ARRAY['artifact']::text[]
  WHEN 'test' THEN ARRAY['quiz']::text[]
  ELSE ARRAY['artifact', 'quiz']::text[]
END WHERE "source" = 'native';--> statement-breakpoint
ALTER TABLE "credentials" FORCE ROW LEVEL SECURITY;
