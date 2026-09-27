CREATE TYPE "public"."domain_claim_status" AS ENUM('pending', 'failed');--> statement-breakpoint
CREATE TABLE "domain_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"token" text NOT NULL,
	"status" "domain_claim_status" DEFAULT 'pending' NOT NULL,
	"last_result" text,
	"last_checked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_claims_tenant_domain" UNIQUE("tenant_id","domain")
);
--> statement-breakpoint
ALTER TABLE "domain_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domain_claims" ADD CONSTRAINT "domain_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_claims" ADD CONSTRAINT "domain_claims_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "domain_claims" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);