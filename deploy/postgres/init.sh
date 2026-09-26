#!/bin/sh
# One-time database setup, run as the Postgres superuser.
# - docker-compose.yml mounts this into /docker-entrypoint-initdb.d/.
# - On Coolify, run it once against the Postgres service (see docs/deployment.md).
#
# Two roles keep the app honest about row-level security:
#   enaibler_owner  owns the schema and runs migrations (DATABASE_MIGRATION_URL)
#   enaibler_app    what the web app and worker connect as (DATABASE_URL);
#                   no DDL, never superuser, never BYPASSRLS
set -eu

: "${ENAIBLER_DB:=enaibler}"
: "${ENAIBLER_OWNER_PASSWORD:?set ENAIBLER_OWNER_PASSWORD}"
: "${ENAIBLER_APP_PASSWORD:?set ENAIBLER_APP_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-postgres}" \
  -v db="$ENAIBLER_DB" \
  -v owner_password="$ENAIBLER_OWNER_PASSWORD" \
  -v app_password="$ENAIBLER_APP_PASSWORD" <<'SQL'
CREATE ROLE enaibler_owner LOGIN PASSWORD :'owner_password';
CREATE ROLE enaibler_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE :"db" OWNER enaibler_owner;
\connect :"db"

-- pgvector is not a trusted extension: only a superuser can create it.
CREATE EXTENSION IF NOT EXISTS vector;

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO enaibler_app;
GRANT USAGE ON SCHEMA public TO enaibler_app;
ALTER DEFAULT PRIVILEGES FOR ROLE enaibler_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO enaibler_app;
ALTER DEFAULT PRIVILEGES FOR ROLE enaibler_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO enaibler_app;

-- pg-boss creates and migrates its own schema on start; the app role owns it.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION enaibler_app;
SQL
