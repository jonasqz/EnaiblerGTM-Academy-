CREATE TYPE "public"."cohort_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "cohort_members" (
	"tenant_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohort_members_cohort_id_user_id_pk" PRIMARY KEY("cohort_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "cohort_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"join_code" text NOT NULL,
	"status" "cohort_status" DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohorts_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "cohorts_join_code" UNIQUE("join_code")
);
--> statement-breakpoint
ALTER TABLE "cohorts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_cohort_fk" FOREIGN KEY ("tenant_id","cohort_id") REFERENCES "public"."cohorts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_cohort_fk" FOREIGN KEY ("tenant_id","cohort_id") REFERENCES "public"."cohorts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cohort_members" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cohorts" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);