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

## 3. Object storage

Hand-ins, recordings, lesson media, logos, fonts, path pictures and data exports live in S3-compatible storage, self-hosted like everything else. Keys always start with `tenants/<id>/`, the bucket is never public, and every download goes through the app, which checks who may see the file.

We use **SeaweedFS** (Apache-2.0): one container with the S3 gateway. MinIO's community edition is in maintenance mode and no longer ships binaries or images, so we don't build on it. Garage (AGPL-3.0) would work too; the app only speaks the S3 API.

1. In the same Coolify project, create a **Docker Compose resource** from this repository with `deploy/storage/docker-compose.yml`. Give it no domain: it stays internal.
2. Set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` on it (random values), and the same values on the app stack.
3. Enable **Connect to Predefined Network** on the storage resource and on the app stack, then set `S3_ENDPOINT=http://<seaweedfs container name>:8333` and `S3_BUCKET=enaibler` on the app.
4. Create the bucket once: in production the app does not create it (`aws --endpoint-url http://<container>:8333 s3 mb s3://enaibler`, or any S3 client).
5. **Backups:** back up the `seaweedfs-data` volume off-server as well (Coolify volume backup or a nightly `rclone sync` to the off-server bucket). Postgres and storage belong together: restore both from the same night.

Without `S3_*`, the app runs, but hand-ins are text and links only and nothing can be uploaded.

## 4. App stack

Create a resource from this Git repository with the **Docker Compose** build pack, using `docker-compose.prod.yml`. It runs:

| Service   | Target   | Role                                                                                               |
| --------- | -------- | -------------------------------------------------------------------------------------------------- |
| `migrate` | `worker` | Runs `scripts/migrate.ts` as `enaibler_owner`, then exits. `web` and `worker` wait for it.         |
| `web`     | `web`    | The Next.js standalone server on port 3000 for all academies. Health check: `GET /api/health`.     |
| `worker`  | `worker` | pg-boss jobs (reviews, mail, webhooks, authoring, domain checks, housekeeping). Drains on SIGTERM. |

Environment variables (Coolify → Environment). Required ones are marked; everything else switches a feature on.

| Variable                                                                 | Service     | Notes                                                                                                                               |
| ------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` (required)                                                | web, worker | `postgres://enaibler_app:…@<db-host>:5432/enaibler`                                                                                 |
| `DATABASE_MIGRATION_URL` (required)                                      | migrate     | `postgres://enaibler_owner:…@<db-host>:5432/enaibler`                                                                               |
| `BETTER_AUTH_SECRET` (required)                                          | web         | At least 32 random characters (`openssl rand -base64 32`)                                                                           |
| `DATA_ENCRYPTION_SECRET` (required)                                      | web, worker | Seals stored secrets: the academies' credential signing keys and webhook secrets. See §9 before you ever change it.                 |
| `EMAIL_FROM_ADDRESS`, `SMTP_URL` (required)                              | web, worker | Platform sender (used when an academy has no `email_sender`) and the EU SMTP relay, `smtps://user:pass@host:465`                    |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`   | web, worker | Object storage, see §3. `S3_REGION` defaults to `eu-central-1`.                                                                     |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_REVIEW_MODEL`                        | web, worker | LiteLLM gateway. Without it, every hand-in waits for a human and authoring help is off.                                             |
| `LLM_BRAND_MODEL`, `LLM_AUTHORING_MODEL`                                 | web, worker | Models for the brand import and for authoring (rubric drafts, interviews, lesson drafts); default: the review model                 |
| `LLM_EMBEDDING_MODEL`                                                    | worker      | Embeddings for source retrieval (1024 dimensions). Without it, drafting retrieves by keywords.                                      |
| `WHISPER_BASE_URL`, `WHISPER_MODEL`, `WHISPER_API_KEY`                   | worker      | Self-hosted transcription, see §8. Without it, recordings are not transcribed.                                                      |
| `AI_MONTHLY_ALLOWANCE_USD`, `AI_UNPRICED_CALL_USD`                       | web, worker | Monthly AI allowance per academy in USD of provider cost (unset: no limit) and what an unpriced call counts (default 0.05), see §11 |
| `PLATFORM_HOST`, `ACADEMY_DOMAIN`                                        | web, worker | Self-serve signup, see §5. Unset: academies from manifests only.                                                                    |
| `PLATFORM_TERMS_URL`, `PLATFORM_DPA_URL`                                 | web         | enaibler's terms and DPA. Signup stays closed without both.                                                                         |
| `PLATFORM_PRIVACY_URL`, `PLATFORM_IMPRINT_URL`                           | web         | Footer of the platform site                                                                                                         |
| `PLATFORM_DEMO_URL`                                                      | web         | An academy the website offers as a demo. Unset: no demo link.                                                                       |
| `PLATFORM_AGREEMENT_VERSION`                                             | web         | Stored with every accepted agreement; bump it when the terms or the DPA change                                                      |
| `CUSTOM_DOMAIN_TARGET`                                                   | web, worker | Host that academies' own domains point at, see §6. Default: `<slug>.<ACADEMY_DOMAIN>`.                                              |
| `PROXY_CONFIG_TOKEN`, `PROXY_SERVICE_URL`                                | web         | The reverse proxy's config endpoint for own domains, see §6                                                                         |
| `PROXY_HTTP_ENTRYPOINT`, `PROXY_HTTPS_ENTRYPOINT`, `PROXY_CERT_RESOLVER` | web         | Traefik names; the defaults `http`, `https` and `letsencrypt` match Coolify's proxy                                                 |
| `TRUSTED_PROXY_CIDRS`                                                    | web         | Proxies whose `X-Forwarded-For` counts for rate limits. Default: private ranges (Traefik). Add a CDN's ranges if one sits in front. |
| `ANALYTICS_PROVIDER`, `ANALYTICS_SCRIPT_URL`, `ANALYTICS_WEBSITE_ID`     | web         | Cookieless page views, see §8                                                                                                       |
| `ERROR_REPORTING_DSN`                                                    | web, worker | GlitchTip project DSN, see §8                                                                                                       |
| `APP_RELEASE`, `APP_ENV`                                                 | web, worker | Release and environment shown with error reports, e.g. the Git commit and `staging`                                                 |
| `APP_TIME_ZONE`                                                          | web         | Time zone of dates in the Studio; default `Europe/Berlin`                                                                           |
| `LOG_FORMAT`                                                             | web, worker | `json` (default in production: one JSON object per line) or `text`                                                                  |

Leave `HOSTNAME=0.0.0.0` as the Dockerfile sets it: the proxy's rewrite to the platform pages only stays inside the server when Next's own origin matches the request. Never set `SAFE_FETCH_ALLOWED_HOSTS` outside local tests, because it exempts hosts from the private-address check of the brand import, source reading and webhooks.

**Outbound traffic.** The `web` container fetches customer websites (brand import). The `worker` reads web page sources, posts webhooks to the academies' endpoints and resolves DNS for domain checks. Both need outbound HTTP and HTTPS; `safe-fetch` only lets them reach public addresses.

## 5. Self-serve academies

Customers create academies themselves on the platform site. Nothing is deployed and no command runs: an academy is a set of database rows in the running stack.

1. **DNS.** Point the platform host (for example `enaibler.app`) and a wildcard for the academy domain (`*.academies.enaibler.app`) at the server.
2. **TLS.** Add both to the **`web` service's domains** in Coolify, with the container port. The wildcard needs a wildcard certificate, which Let's Encrypt only issues through the DNS challenge: give Coolify's Traefik proxy a DNS provider token and a certificate resolver that uses it.
3. **Environment.** Set `PLATFORM_HOST=enaibler.app`, `ACADEMY_DOMAIN=academies.enaibler.app` and the four `PLATFORM_*_URL` links. Every academy stores the version and the exact wording of the terms and DPA its admin accepted (`tenant_agreements`).
4. **Brand import** works without `LLM_BASE_URL` too, by rules only.
5. **Check.** Create a test academy on `https://<PLATFORM_HOST>/`, follow the e-mail into its Studio, import a brand from a real website, add the legal pages (publishing needs them) and publish a course.

## 6. Own domains for academies

Academy admins connect their own domain in Studio → Settings → Domains. The Studio shows two DNS records: a TXT record `_enaibler.<domain>` with a per-claim token (proof of control), and a CNAME (or A/AAAA records) pointing at the academy. The worker checks open claims every ten minutes, and admins can check at once. A verified domain can become the academy's main address; its other addresses then redirect there (308). Claims that are not set up within a week lapse.

The reverse proxy learns about verified domains from the app, so a new domain gets its route and certificate without a deploy:

1. **Target.** By default, own domains point at `<slug>.<ACADEMY_DOMAIN>`. If they should point at one fixed host instead (for example `domains.enaibler.app`, a CNAME to the server), set `CUSTOM_DOMAIN_TARGET` on `web` and `worker`.
2. **Token and service.** Set `PROXY_CONFIG_TOKEN` (random) and `PROXY_SERVICE_URL`, the address at which Traefik reaches the web container, for example `http://<web container name>:3000`.
3. **Traefik (Coolify's proxy).** In Coolify → Servers → Proxy → Configuration, add the HTTP provider to the Traefik command:

   ```yaml
   - "--providers.http.endpoint=http://<web container name>:3000/api/internal/proxy/traefik?token=<PROXY_CONFIG_TOKEN>"
   - "--providers.http.pollInterval=30s"
   ```

   The endpoint returns a router per verified domain (HTTPS with the `letsencrypt` resolver, plus an HTTP → HTTPS redirect). Certificates come from the HTTP challenge, so no DNS token is needed for own domains.

4. **Caddy instead of Traefik.** Use on-demand TLS with `ask http://<web>:3000/api/internal/proxy/tls?token=<PROXY_CONFIG_TOKEN>`: it answers 200 only for the platform host and live academy domains, so nobody can make the proxy request certificates for other names.

`/api/internal/*` is not routed through the tenant proxy and answers 404 without the token. Academies from manifests keep their domains in the manifest, added to the `web` service by hand (§7).

## 7. Manifest academies

Operators can still set up an academy from a manifest, for example tenant 0 on its own domain. Applying a manifest replaces the academy's settings, theme and terminology, including what its admins changed in the Studio, so use manifests only for academies you manage that way.

For each academy:

1. **Validate and apply the manifest.** Run it from the worker image, for example as a Coolify "Execute command" on the `worker` service:

   ```bash
   node --import tsx scripts/tenant-apply.ts --dry-run config/tenants/<slug>.yaml   # validate first
   DATABASE_MIGRATION_URL=… node --import tsx scripts/tenant-apply.ts config/tenants/<slug>.yaml
   ```

2. **Add the domain.** Add each domain from the manifest to the **`web` service's domains** in Coolify, with the container port: `https://academy.scaling-product.com:3000`. Traefik issues Let's Encrypt certificates. The academy's DNS needs a CNAME or A record pointing at the server.
3. **E-mail.** If the manifest sets `email_sender`, verify that sender domain with the SMTP relay (SPF and DKIM).
4. **Studio access.** Give the academy's team their roles from the worker image; they then sign in with a magic link and open `https://<domain>/studio`:

   ```bash
   node --import tsx scripts/grant-role.ts <slug> team@example.com tenant_admin   # or author, reviewer, mentor
   ```

5. **Check.** Open `https://<domain>/` and confirm the theme. Publish a course in the Studio, then run the entry link `https://<domain>/start?course=<slug>&utm_source=test` end to end, including a submission: with the worker running, the AI result (or the review queue, without `LLM_BASE_URL`) should follow within a minute.

The app picks up manifest changes within about 30 seconds (tenant cache TTL). No redeploy is needed.

A course shell in a manifest may say how the course ends: `completion: work` (the default), `test` or `work_and_test`. Re-applying a manifest changes it only where the key is present, so a choice authors made in the Studio stays; the assignment or the final test is set up in the Studio.

## 8. Surrounding services (each its own Coolify resource)

- **LiteLLM** gateway. Configure the EU-region or zero-retention provider (open decision #1) and model prices, so that the cost of every review, draft and calibration run is logged (`cost_micro_usd`). Run `npm run review:spike` against it to measure agreement, stability, cost and latency on real exemplars.
- **Whisper** for recordings: an OpenAI-compatible server such as [speaches](https://github.com/speaches-ai/speaches) with faster-whisper, CPU for MVP volumes, on the GPU server later. Keep it internal (predefined network) and set `WHISPER_BASE_URL=http://<container>:8000/v1` and `WHISPER_MODEL` (for example `Systran/faster-whisper-small`) on the worker. The worker image contains ffmpeg for audio and keyframes.
- **Umami or Plausible CE** for cookieless page views. Set `ANALYTICS_PROVIDER=umami` or `plausible` and `ANALYTICS_SCRIPT_URL` (Umami: `https://<stats host>/script.js` and `ANALYTICS_WEBSITE_ID`, one website for all academies, told apart by hostname; Plausible: its `script.manual.js`). Learner and platform pages send the path only: no query strings, no pages whose address carries a token, nothing from the Studio or the embedded path picker. Product events and the funnel stay in Postgres (`events`).
- **GlitchTip** for errors (Sentry-compatible): create a project and set `ERROR_REPORTING_DSN` on `web` and `worker`. Reports carry the route, the academy's host and the stack trace, never request bodies, headers, query strings or e-mail addresses. The same error is sent at most once a minute.
- **Uptime Kuma** on `GET /api/health` (checks the database too). The worker has no HTTP port: watch its container state in Coolify, and its JSON log lines (`"level":"error"`).

## 9. Secrets

- `DATA_ENCRYPTION_SECRET` seals each academy's Open Badges signing key and its webhook signing secrets in the database (AES-256-GCM). With a different value, the sealed keys can no longer be opened: badge downloads and webhook deliveries fail until the keys are replaced (a new signing key, a new secret for every endpoint). The public keys stay published, so badges issued before still verify. Keep the secret in the password manager next to the database backups, and never rotate it without re-sealing.
- `BETTER_AUTH_SECRET` signs sessions: changing it signs everyone out.
- `PROXY_CONFIG_TOKEN` guards the proxy endpoints: rotate it in the app and the proxy configuration together.

## 10. Release checklist

- CI is green: lint, types, unit tests, build, migrations and RLS tests.
- Migrations are reviewed. Any new tenant table has RLS forced (see `CLAUDE.md`).
- Manifest warnings are resolved for live academies: legal links and sender.
- Before signup opens: enaibler's terms, DPA, privacy page and imprint are published, and a test academy has gone through §5, step 5.
- Before signup opens: `AI_MONTHLY_ALLOWANCE_USD` is set on `web` and `worker` (§11), so no new academy can run up the provider bill.
- Storage: the bucket exists, and a test hand-in with a PDF uploads and downloads.
- Own domains: a test domain verifies, gets a certificate and redirects its other addresses.
- LinkedIn "Add to profile" prefill is click-tested on a real account.
- A course that ends with a final test goes through end to end: a failed attempt, a retake and the credential saying "Final Test passed".

## 11. AI usage per academy

Every model call is recorded for the academy that caused it (`ai_usage`), with the cost LiteLLM reports. Academies see their amounts in Studio → Settings → Usage; the operator sees what they cost:

```bash
DATABASE_MIGRATION_URL=… node --import tsx scripts/usage-report.ts --month 2026-09          # table
DATABASE_MIGRATION_URL=… node --import tsx scripts/usage-report.ts --month 2026-09 --csv    # for a spreadsheet
```

Months are calendar months in Berlin time; without `--month` the report covers the last full month. A cost column marked `*` had calls whose price the gateway did not know: give LiteLLM a price for that model. Self-hosted Whisper is recorded in minutes of audio at no per-call cost.

**Monthly allowance.** Until AI use is priced, each academy may spend a monthly allowance in US dollars of provider cost, counted per calendar month in Berlin time like the report. `AI_MONTHLY_ALLOWANCE_USD` on `web` and `worker` sets it for every academy (unset: no limit; `0`: no AI). One academy can get its own amount, no limit, or the default back: `setAiAllowance` in `src/server/ai-allowance.ts` writes `tenants.ai_allowance_micro_usd` (null is the default, -1 no limit) and reads it back with the month's spend. Academy admins cannot change it: it is in neither the manifest nor the Studio settings. Every model call checks it first, so the last call of a month can go a little over; a change applies from the next call.

What counts is the cost LiteLLM reports. So that no model is free by accident, a call without a price counts at `AI_UNPRICED_CALL_USD` (default 0.05), and transcription on our own Whisper at 0.006 a minute of audio. Once the allowance is used up, hand-ins wait for a person (the review queue says why), authoring jobs stop with a message in the Studio, the brand import keeps its rule-based proposal, and learners notice nothing but a later reply. Academies see the share they used in Settings → Usage, and the Studio overview warns from 80 %. The report adds `counted` (what counts against the allowance), `allowance` and `used` for each academy, against the allowances as set today. It reads both variables like the app, so run it where they are set, for example on the `worker`.
