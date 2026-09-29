ALTER TYPE "public"."notification_kind" ADD VALUE 'course';--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "session_count" integer;