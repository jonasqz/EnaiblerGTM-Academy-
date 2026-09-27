-- The artifact name on a credential becomes localized text, like the course
-- title. Existing names keep the language they were issued in: the
-- learner's enrollment language, else the academy's default. Row-level
-- security is forced on both tables, so the owner lifts it for the backfill.
ALTER TABLE "credentials" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollments" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "artifact_locale" text;--> statement-breakpoint
UPDATE "credentials" AS c SET "artifact_locale" = coalesce(
  (SELECT e."locale"::text FROM "enrollments" e
    WHERE e."tenant_id" = c."tenant_id" AND e."user_id" = c."user_id" AND e."course_id" = c."course_id"
    LIMIT 1),
  (SELECT t."config" ->> 'default_locale' FROM "tenants" t WHERE t."id" = c."tenant_id"),
  'en'
) WHERE c."artifact_name" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "artifact_name" SET DATA TYPE jsonb USING (
  CASE WHEN "artifact_name" IS NULL THEN NULL
  ELSE jsonb_build_object("artifact_locale", "artifact_name") END
);--> statement-breakpoint
ALTER TABLE "credentials" DROP COLUMN "artifact_locale";--> statement-breakpoint
ALTER TABLE "enrollments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" FORCE ROW LEVEL SECURITY;
