# Deployment on Coolify

Everything runs on EU servers we control (brief §9, §11). There is one Coolify project per environment (staging, production). The only external processors are the LLM provider behind LiteLLM and the SMTP relay.

## 1. Servers

- Start with one EU VPS (for example Hetzner) for the app and the database, and add Coolify.
- Add a worker or GPU server later if Whisper transcription needs it (open decision #2).

## 2. Postgres

1. Create a **PostgreSQL 16 database resource** in Coolify from the `pgvector/pgvector:pg16` image.
2. Run the role setup **once** as the superuser:

   ```bash
   ENAIBLER_DB=enaibler \
   ENAIBLER_OWNER_PASSWORD='<random>' \
   ENAIBLER_APP_PASSWORD='<random>' \
   PGHOST=<db-host> PGUSER=postgres PGPASSWORD='<superuser>' \
   POSTGRES_USER=postgres POSTGRES_DB=postgres \
   ./deploy/postgres/init.sh
   ```

   The script creates:

   - `enaibler_owner`, which owns the schema and runs migrations;
   - `enaibler_app`, which the app and worker use (no DDL, never superuser or BYPASSRLS);
   - the `enaibler` database, the `vector` extension, and the `pgboss` schema.

3. **Backups:** schedule Coolify Postgres backups to an off-server S3 bucket (different provider and location), and test a restore before tenant 0 goes live.

Never point `DATABASE_URL` at `postgres` or another superuser. Superusers bypass row-level security, and the app refuses to start in production if they do.

## 3. App stack

Create a resource from this Git repository with the **Docker Compose** build pack, using `docker-compose.prod.yml`. It runs:

| Service   | Target   | Role                                                                                         |
| --------- | -------- | -------------------------------------------------------------------------------------------- |
| `migrate` | `worker` | Runs `scripts/migrate.ts` as `enaibler_owner`, then exits. `web` and `worker` wait for it.   |
| `web`     | `web`    | The Next.js standalone server on port 3000 for all tenants. Health check: `GET /api/health`. |
| `worker`  | `worker` | pg-boss jobs. Drains on SIGTERM.                                                             |

Environment variables (Coolify → Environment):

| Variable                                                               | Notes                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                         | `postgres://enaibler_app:…@<db-host>:5432/enaibler`                            |
| `DATABASE_MIGRATION_URL`                                               | `postgres://enaibler_owner:…@<db-host>:5432/enaibler`                          |
| `BETTER_AUTH_SECRET`                                                   | At least 32 random characters (`openssl rand -base64 32`)                      |
| `EMAIL_FROM_ADDRESS`                                                   | Platform sender, used when a tenant has no `email_sender`                      |
| `SMTP_URL`                                                             | EU SMTP relay, `smtps://user:pass@host:465`                                    |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Self-hosted S3 (MinIO, Garage or SeaweedFS: open decision #3)                  |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_REVIEW_MODEL`                      | LiteLLM gateway                                                                |
| `LLM_BRAND_MODEL`                                                      | Model for the brand import; defaults to `LLM_REVIEW_MODEL`                     |
| `PLATFORM_HOST`, `ACADEMY_DOMAIN`                                      | Self-serve signup, see §4. Unset: academies from manifests only                |
| `PLATFORM_TERMS_URL`, `PLATFORM_DPA_URL`                               | enaibler's terms and DPA. Signup stays closed without both                     |
| `PLATFORM_PRIVACY_URL`, `PLATFORM_IMPRINT_URL`                         | Footer of the platform site                                                    |
| `PLATFORM_AGREEMENT_VERSION`                                           | Stored with every accepted agreement; bump it when the terms or the DPA change |

Leave `HOSTNAME=0.0.0.0` as the Dockerfile sets it: the proxy's rewrite to the platform pages only stays inside the server when Next's own origin matches the request. Never set `SAFE_FETCH_ALLOWED_HOSTS` outside local tests, because it exempts hosts from the private-address check of the brand import and of webhooks.

## 4. Self-serve academies

Customers create academies themselves on the platform site. Nothing is deployed and no command runs: an academy is a set of database rows in the running stack.

1. **DNS.** Point the platform host (for example `enaibler.app`) and a wildcard for the academy domain (`*.academies.enaibler.app`) at the server.
2. **TLS.** Add both to the **`web` service's domains** in Coolify, with the container port. The wildcard needs a wildcard certificate, which Let's Encrypt only issues through the DNS challenge: give Coolify's Traefik proxy a DNS provider token and a certificate resolver that uses it.
3. **Environment.** Set `PLATFORM_HOST=enaibler.app`, `ACADEMY_DOMAIN=academies.enaibler.app` and the four `PLATFORM_*_URL` links. Every academy stores the version and the exact wording of the terms and DPA its admin accepted (`tenant_agreements`).
4. **Brand import** fetches customer websites from the `web` container, so it needs outbound HTTP and HTTPS. Without `LLM_BASE_URL` it still works, by rules only.
5. **Check.** Create a test academy on `https://<PLATFORM_HOST>/`, follow the e-mail into its Studio, import a brand from a real website, add the legal pages (publishing needs them) and publish a course.

Self-serve academies live on `<slug>.<ACADEMY_DOMAIN>`. Their own domains are not supported yet.

## 5. Manifest academies and own domains

Operators can still set up an academy from a manifest, for example tenant 0 on its own domain. Applying a manifest replaces the academy's settings, theme and terminology, including what its admins changed in the Studio, so use manifests only for academies you manage that way.

For each academy:

1. **Validate and apply the manifest.** Run it from the worker image, for example as a Coolify "Execute command" on the `worker` service:

   ```bash
   node --import tsx scripts/tenant-apply.ts --dry-run config/tenants/<slug>.yaml   # validate first
   DATABASE_MIGRATION_URL=… node --import tsx scripts/tenant-apply.ts config/tenants/<slug>.yaml
   ```

2. **Add the domain.** Add each domain from the manifest to the **`web` service's domains** in Coolify, with the container port: `https://academy.scaling-product.com:3000`. Traefik issues Let's Encrypt certificates. The tenant's DNS needs a CNAME or A record pointing at the server.
3. **E-mail.** If the manifest sets `email_sender`, verify that sender domain with the SMTP relay (SPF and DKIM).
4. **Studio access.** Give the academy's team their roles from the worker image; they then sign in with a magic link and open `https://<domain>/studio`:

   ```bash
   node --import tsx scripts/grant-role.ts <slug> team@example.com tenant_admin   # or author, reviewer
   ```

5. **Check.** Open `https://<domain>/` and confirm the theme. Publish a course in the Studio, then run the entry link `https://<domain>/start?course=<slug>&utm_source=test` end to end, including a submission: with the worker running, the AI result (or the review queue, without `LLM_BASE_URL`) should follow within a minute.

The app picks up manifest changes within about 30 seconds (tenant cache TTL). No redeploy is needed.

## 6. Surrounding services (each its own Coolify resource)

- **LiteLLM** gateway. Configure the EU-region or zero-retention provider (open decision #1) and model prices, so that cost per review is logged. Run `npm run review:spike` against it for the October spike.
- **faster-whisper** for transcription (authoring, not wired up yet).
- **Umami or Plausible CE** for cookieless page views. Product events are stored in Postgres (`events`).
- **Uptime Kuma** on `/api/health`, and **GlitchTip** for errors.

## 7. Release checklist

- CI is green: lint, types, unit tests, build, migrations and RLS tests.
- Migrations are reviewed. Any new tenant table has RLS forced (see `CLAUDE.md`).
- Manifest warnings are resolved for live tenants: legal links and sender.
- Before signup opens: enaibler's terms, DPA, privacy page and imprint are published, and a test academy has gone through §4, step 5.
- LinkedIn "Add to profile" prefill is click-tested on a real account.
