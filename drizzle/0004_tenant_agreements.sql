CREATE TYPE "public"."agreement_kind" AS ENUM('terms', 'dpa');--> statement-breakpoint
CREATE TABLE "tenant_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "agreement_kind" NOT NULL,
	"version" text NOT NULL,
	"wording" text NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_agreements" ADD CONSTRAINT "tenant_agreements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_agreements" ADD CONSTRAINT "tenant_agreements_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_agreements" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);