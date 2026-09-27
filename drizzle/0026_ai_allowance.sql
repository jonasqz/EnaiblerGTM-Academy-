ALTER TABLE "tenants" ADD COLUMN "ai_allowance_micro_usd" bigint;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "hold_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ai_allowance" CHECK ("tenants"."ai_allowance_micro_usd" >= -1);