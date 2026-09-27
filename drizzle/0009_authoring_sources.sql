CREATE TYPE "public"."draft_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "lesson_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"status" "draft_status" DEFAULT 'queued' NOT NULL,
	"requested_by" text,
	"lesson_ids" uuid[] DEFAULT '{}' NOT NULL,
	"notes" text[] DEFAULT '{}' NOT NULL,
	"error" text,
	"model" text,
	"prompt_version" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micro_usd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "lesson_drafts_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "lesson_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "source_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "flag_reason" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_drafts" ADD CONSTRAINT "lesson_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_drafts" ADD CONSTRAINT "lesson_drafts_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_drafts" ADD CONSTRAINT "lesson_drafts_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_file_fk" FOREIGN KEY ("tenant_id","file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "lesson_drafts" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);