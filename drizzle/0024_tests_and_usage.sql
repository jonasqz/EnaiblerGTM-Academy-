CREATE TYPE "public"."completion_mode" AS ENUM('work', 'test', 'work_and_test');--> statement-breakpoint
CREATE TYPE "public"."credential_basis" AS ENUM('work', 'test', 'work_and_test');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_kind" AS ENUM('review', 'calibration', 'rubric_draft', 'interview', 'lesson_draft', 'recording_topics', 'transcription', 'embedding', 'brand_import');--> statement-breakpoint
CREATE TABLE "course_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pass_percent" integer DEFAULT 80 NOT NULL,
	"show_mistakes" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_tests_one_per_course" UNIQUE("tenant_id","course_id"),
	CONSTRAINT "course_tests_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "course_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "test_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"test_version" integer NOT NULL,
	"locale" text NOT NULL,
	"answers" jsonb NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_attempts_attempt" UNIQUE("tenant_id","course_id","user_id","attempt_no"),
	CONSTRAINT "test_attempts_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "test_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "ai_usage_kind" NOT NULL,
	"model" text,
	"course_id" uuid,
	"ref_id" uuid,
	"calls" integer DEFAULT 1 NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"audio_seconds" integer,
	"cost_micro_usd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "artifact_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "completion_mode" "completion_mode" DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "basis" "credential_basis" DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "test_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "course_tests" ADD CONSTRAINT "course_tests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tests" ADD CONSTRAINT "course_tests_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_tenant_time_idx" ON "ai_usage" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "course_tests" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "test_attempts" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_usage" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);