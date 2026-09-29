CREATE TYPE "public"."webinar_attendance_source" AS ENUM('checkin_code', 'manual', 'tool_report');--> statement-breakpoint
CREATE TYPE "public"."webinar_registration_status" AS ENUM('pending', 'registered', 'waitlist', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."webinar_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."webinar_tool" AS ENUM('link', 'zoom', 'teams', 'meet');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'presenter_photo';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'webinar';--> statement-breakpoint
CREATE TABLE "webinar_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"webinar_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"source" "webinar_attendance_source" NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"duration_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webinar_attendance_user" UNIQUE("tenant_id","webinar_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "webinar_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webinar_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"webinar_id" uuid NOT NULL,
	"user_id" text,
	"email" text,
	"status" "webinar_registration_status" DEFAULT 'pending' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entry_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locale" text NOT NULL,
	"confirm_token_hash" text,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webinar_registrations_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "webinar_registrations_user" UNIQUE("tenant_id","webinar_id","user_id"),
	CONSTRAINT "webinar_registrations_owner" CHECK ("webinar_registrations"."user_id" is not null or ("webinar_registrations"."status" = 'pending' and "webinar_registrations"."email" is not null))
);
--> statement-breakpoint
ALTER TABLE "webinar_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webinars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "webinar_status" DEFAULT 'draft' NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"capacity" integer,
	"tool" "webinar_tool" DEFAULT 'link' NOT NULL,
	"join_url" text,
	"external_id" text,
	"course_id" uuid,
	"recorded" boolean DEFAULT false NOT NULL,
	"recording_notice" text,
	"presenters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocks" jsonb NOT NULL,
	"form" jsonb NOT NULL,
	"checkin_code" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webinars_tenant_slug" UNIQUE("tenant_id","slug"),
	CONSTRAINT "webinars_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "webinars_duration" CHECK ("webinars"."duration_minutes" between 10 and 600),
	CONSTRAINT "webinars_capacity" CHECK ("webinars"."capacity" is null or "webinars"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "webinars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webinar_attendance" ADD CONSTRAINT "webinar_attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_attendance" ADD CONSTRAINT "webinar_attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_attendance" ADD CONSTRAINT "webinar_attendance_webinar_fk" FOREIGN KEY ("tenant_id","webinar_id") REFERENCES "public"."webinars"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_webinar_fk" FOREIGN KEY ("tenant_id","webinar_id") REFERENCES "public"."webinars"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinars" ADD CONSTRAINT "webinars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinars" ADD CONSTRAINT "webinars_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinars" ADD CONSTRAINT "webinars_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webinar_registrations_pending_email" ON "webinar_registrations" USING btree ("tenant_id","webinar_id","email") WHERE "webinar_registrations"."email" is not null;--> statement-breakpoint
CREATE INDEX "webinar_registrations_status_idx" ON "webinar_registrations" USING btree ("tenant_id","webinar_id","status");--> statement-breakpoint
CREATE INDEX "webinars_starts_idx" ON "webinars" USING btree ("tenant_id","status","starts_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "webinar_attendance" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "webinar_registrations" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "webinars" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);