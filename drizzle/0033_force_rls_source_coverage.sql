-- FORCE ROW LEVEL SECURITY on every table that has RLS enabled, so even the
-- table owner is bound by the tenant_isolation policies (only superusers and
-- BYPASSRLS roles skip RLS; the app refuses to run as either in production).
-- drizzle-kit cannot emit this. Idempotent: re-run it (copy this file into a
-- new custom migration) whenever a migration adds a tenant-scoped table;
-- tests/db/rls.test.ts fails if one is missed.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;
