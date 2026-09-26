# enaibler

Proof-of-work academies. Learners build something real, AI reviews it against a rubric, and the credential is backed by the work.

The product spec is [`docs/product-brief-v2.md`](docs/product-brief-v2.md) (Brief v2, September 2026). Coding assistants should read [`CLAUDE.md`](CLAUDE.md) first.

## Status

This repository holds the **October 2026 foundation** from the brief's build order (§13), plus the first pieces of the November work:

| Area                                         | State                                                                                                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant, theme, terminology and domain system | ✅ Declarative tenant manifests (`config/tenants/*.yaml`) validated by one generic schema. Tenant 0 (Appendix A) is pure config, and a test reads Appendix A straight from the brief.                                                               |
| Data model with RLS                          | ✅ Drizzle schema for the §4 entities. Postgres RLS is enabled **and forced** on every tenant table, composite foreign keys block cross-tenant links, and tests run against real Postgres.                                                          |
| Auth                                         | ✅ Better Auth magic links, one instance per academy (tenant-bound sessions, host-only cookies). A confirm step stops mail scanners from using up the link.                                                                                         |
| Deep-link entry                              | ✅ `/start?path&course&lang&utm_*` carries its context through sign-up in the URL, with no tracking cookie, and it is stored on the enrollment.                                                                                                     |
| Compliance guards                            | ✅ Wording lint (blocked or warning by context), FernUSG delivery-mode rules, self-hosted fonts only, private-by-default credentials.                                                                                                               |
| Credentials                                  | ✅ Verification page, OG image (1200×630) and card (1200×848), LinkedIn share and add-to-profile, visibility toggle, CTA back into `/start`. Open Badges 3.0 builder and import schema. Issuing credentials on pass comes with the review pipeline. |
| AI review                                    | 🟡 Rubric model, scoring, human-in-the-loop routing, prompt with injection defence, validated output with retry, and an **October spike harness** (`scripts/review-spike.ts`). The review job, queue UI and overrides come in November.             |
| Jobs, storage, events                        | 🟡 pg-boss worker with queues (email handler live), tenant-prefixed S3 keys with signed URLs, product events and a funnel query.                                                                                                                    |
| Not started                                  | Course player UI, assignment upload, review queue, authoring (recording → Whisper → draft, editor, calibration), data export/delete UI, funnel dashboard, admin UI.                                                                                 |

## Quickstart

```bash
npm install
docker compose up -d                  # Postgres 16 + pgvector (roles via deploy/postgres/init.sh) and Mailpit
cp .env.example .env.local
npm run db:migrate                    # as the schema owner (DATABASE_MIGRATION_URL)
npm run tenant:apply -- config/tenants/demo.yaml config/tenants/scaling-product.yaml
npm run dev
```

Then open:

- http://demo.localhost:3000 for the demo academy (enaibler's default theme)
- http://scaling-product.localhost:3000 for tenant 0 (Scaling Product's theme and terminology)

In development, `<slug>.localhost` maps to the tenant with that slug. Magic-link e-mails are printed to the console, or caught by Mailpit on http://localhost:8025 if you set `SMTP_URL=smtp://localhost:1025`. Courses from manifests start as drafts, so publish one to see it in the catalogue.

## Commands

| Command                                       | What it does                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js                                                                                                                                               |
| `npm run worker`                              | pg-boss worker (jobs)                                                                                                                                 |
| `npm run check`                               | lint, typecheck and all tests                                                                                                                         |
| `npm test -- --project unit`                  | Unit tests (no database needed)                                                                                                                       |
| `npm run test:db`                             | Database tests: set `TEST_DATABASE_URL` (app role) and `TEST_DATABASE_MIGRATION_URL` (owner) against a database prepared by `deploy/postgres/init.sh` |
| `npm run db:generate`                         | Generate a migration from `src/db/schema`                                                                                                             |
| `npm run db:migrate`                          | Apply migrations (schema owner)                                                                                                                       |
| `npm run tenant:validate -- <file>`           | Validate a tenant manifest (errors and warnings)                                                                                                      |
| `npm run tenant:apply -- <file>`              | Apply a tenant manifest to the database                                                                                                               |
| `npm run review:spike -- <folder> [--runs n]` | AI review spike: agreement, stability, cost and latency on exemplars (needs `LLM_*`)                                                                  |

## Layout

```
config/tenants/      Tenant manifests: tenant 0 (Appendix A) and a local demo
deploy/postgres/     Role and database setup (owner vs. app role, pgvector, pg-boss schema)
docs/                Product brief v2, deployment runbook
drizzle/             Migrations (generated, plus custom: pgvector, FORCE RLS)
scripts/             migrate, tenant-apply, review-spike
spikes/review/       Review spike inputs (rubric and exemplars); results/ is gitignored
src/core/            Framework-free domain logic, unit tested: tenant manifest, theme,
                     terminology, i18n, wording lint, delivery modes, levels, entry context,
                     rubric, review policy and prompt, credentials, storage keys
src/db/              Drizzle schema, client, withTenant(), tenant manifest persistence
src/server/          Server code: tenant resolution, auth, email, events, storage, LLM, jobs
src/app/             Next.js App Router pages and route handlers
src/proxy.ts         Host → tenant (Next 16 proxy, Node runtime)
src/worker/          pg-boss worker entry point
tests/db/            Tests against real Postgres (RLS, manifests, funnel)
```

## How it works

**Tenancy.** `src/proxy.ts` resolves the `Host` header to a tenant through `tenant_domains` (cached) and returns 404 for unknown hosts. Server code gets the tenant with `getTenant()` (`src/server/request.ts`). Every query on tenant data runs inside `withTenant(db, tenantId, tx => …)`, which sets `app.tenant_id` for that transaction only. The RLS policies (`tenant_id = current_setting('app.tenant_id')`) and composite foreign keys enforce isolation in the database too. The app connects as `enaibler_app`, which is neither superuser nor BYPASSRLS; the app refuses to start in production otherwise. Migrations run as `enaibler_owner`.

**Tenant configuration.** A manifest (`config/tenants/*.yaml`) declares settings, domains, locales, legal links, features, theme tokens, terminology, paths, levels and course shells. `src/core/tenant/manifest.ts` validates it: strict keys, wording lint on every name that appears on credentials, cross-checks, and non-blocking warnings. `npm run tenant:apply` writes it to the database in one transaction. Authored content (course titles, path order) is never overwritten.

**Theme.** Tokens (colours, fonts, radius, border width, shadow, visual style) are validated strictly because they end up in CSS. The root layout puts them on `<html style>` as `--tenant-*` variables, and `globals.css` maps them into Tailwind v4 (`bg-primary`, `rounded-card`, `shadow-card`, `font-display` and so on). `src/core/theme/enaibler-tokens.ts` is the default theme.

**Auth.** `authFor(tenant)` builds a cached Better Auth instance per academy that only accepts that academy's hosts. Every session is stamped with the tenant it was created on, and `getViewer()` ignores sessions from other academies. The magic-link e-mail uses the tenant's template and sender and links to `/sign-in/confirm`. A form POST there calls Better Auth's verify endpoint, so link pre-fetchers do not use up the single-use token.

**Entry and events.** `/start` parses the deep link, drops invalid values, and passes the context along as `?ctx=` through the course page, the sign-in form and the magic-link callback. `/auth/continue` then creates the membership, profile and enrollment and records `signup_completed` and `course_started` with the entry `utm_*` values. The only cookies are the session cookie and a language preference.

**Credentials.** `/verify/<public_id>` shows public credentials to everyone and private ones only to their owner, with a visibility toggle. Everything else looks like "This credential is no longer available". Views, CTA clicks and LinkedIn shares are recorded as events; bots are ignored. Images are rendered with `next/og` from the tenant theme.

**AI review.** `src/core/review` holds the rubric model, weighted scoring (pass/fail is computed here, never taken from the model), the §8 routing defaults (spot checks, escalation near the threshold and on the third failed attempt), the versioned prompt with a nonce-tagged data block, and output validation that checks quoted evidence against the submission. `src/server/review/run-ai-review.ts` calls LiteLLM with structured output and retries invalid output.

## Deployment

Coolify on EU servers: see [`docs/deployment.md`](docs/deployment.md). CI (`.github/workflows/ci.yml`) runs lint, types, unit tests, manifest validation and the build. A second job runs migrations and the RLS tests against Postgres 16 with pgvector, prepared by the same `init.sh` as production.

## Known gaps and open items

- **Brand tokens:** `src/core/theme/enaibler-tokens.ts` has placeholder values. Replace them with the real `enaibler-tokens.ts`, which is not in this repository.
- **Tenant 0 legal links** in `config/tenants/scaling-product.yaml` point to the home page. Validation warns about this until the exact pages are set.
- **Wording:** `enaibler-landing.html` and the brand guide still say "certified" (brief Appendix B). They are not in this repository.
- **German copy:** "Abschlussbescheinigung" (for "Certificate of Completion") and the use of "du" are proposals and need review, the former by counsel.
- **LinkedIn prefill:** LinkedIn does not guarantee the add-to-profile prefill, so click-test it before release.
- **Open decisions** (brief §15): LLM provider, object storage choice, embedding size (1024 is a placeholder in `src/db/schema/authoring.ts`).
