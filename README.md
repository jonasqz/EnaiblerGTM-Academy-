# enaibler

Proof-of-work academies. Learners build something real, AI reviews it against a rubric, and the credential is backed by the work.

The product spec is [`docs/product-brief-v2.md`](docs/product-brief-v2.md) (Brief v2, September 2026). Coding assistants should read [`CLAUDE.md`](CLAUDE.md) first.

## Status

This repository holds the **October 2026 foundation** from the brief's build order (§13), most of the November work (the learner loop, the review pipeline and the Studio) and self-serve academies: customers sign up, get their academy at once and style it themselves.

| Area                                         | State                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant, theme, terminology and domain system | ✅ Declarative tenant manifests (`config/tenants/*.yaml`) validated by one generic schema. Tenant 0 (Appendix A) is pure config, and a test reads Appendix A straight from the brief.                                                                                         |
| Data model with RLS                          | ✅ Drizzle schema for the §4 entities. Postgres RLS is enabled **and forced** on every tenant table, composite foreign keys block cross-tenant links, and tests run against real Postgres.                                                                                    |
| Auth                                         | ✅ Better Auth magic links, one instance per academy (tenant-bound sessions, host-only cookies). A confirm step stops mail scanners from using up the link. `?next=` brings people back to where they were.                                                                   |
| Deep-link entry                              | ✅ `/start?path&course&lang&utm_*` carries its context through sign-up in the URL, with no tracking cookie, and it is stored on the enrollment.                                                                                                                               |
| Learner loop                                 | ✅ Catalogue, course page, lesson player with progress (resumable, per-language lessons linked by key), assignment with text, template-form and link hand-ins, feedback per criterion, revise and resubmit.                                                                   |
| AI review                                    | ✅ `review.run` job: rubric-scored review through LiteLLM, §8 routing (spot checks, escalation near the threshold and on repeated fails), human fallback when the gateway fails, review queue with decisions and overrides with reason.                                       |
| Credentials                                  | ✅ Issued on pass, revoked on a reversed decision, levels on paths. Verification page, OG image and card, LinkedIn share and add-to-profile, visibility toggle, CTA back into `/start`. Open Badges 3.0 builder and import schema.                                            |
| Studio (authors and reviewers)               | ✅ Overview with funnel, every course incl. drafts, outcome-first create and edit (outcome, rubric editor, lessons with versions, coverage map, details, publish checklist, preview as learner), learners per course, people, reviews.                                        |
| Self-serve academies                         | ✅ Customers create an academy on the platform site: name, address `<slug>.<ACADEMY_DOMAIN>`, work e-mail, languages, terms and DPA. It is a database write in the running deployment, never a deploy, and a magic link takes the first admin into the Studio.                |
| Academy settings and brand                   | ✅ Studio → Settings: name, languages, website, legal pages, CTA. Brand editor with presets, colours, bundled fonts, shape, live preview and a contrast guard. "Import from your website" proposes a theme from the site's CSS, optionally refined by the model.              |
| Learner data                                 | ✅ "My learning": certificates and their visibility, name on certificates, contact opt-in (lead handoff), JSON export, delete.                                                                                                                                                |
| Jobs, storage, events                        | 🟡 pg-boss worker (e-mail and review handlers), tenant-prefixed S3 keys with signed URLs, product events and the funnel.                                                                                                                                                      |
| Not started                                  | Custom domains for self-serve academies, logo and own-font upload, file uploads (PDF, images), AI drafting (rubric from an example, recording → Whisper → lessons), calibration against exemplars, path and level editing in the Studio, Studio in German, cohorts, payments. |

## Quickstart

```bash
npm install
docker compose up -d                  # Postgres 16 + pgvector (roles via deploy/postgres/init.sh) and Mailpit
cp .env.example .env.local
npm run db:migrate                    # as the schema owner (DATABASE_MIGRATION_URL)
npm run tenant:apply -- config/tenants/demo.yaml config/tenants/scaling-product.yaml
npm run role:grant -- demo you@example.com tenant_admin   # your way into the Studio
npm run dev
npm run worker                        # second terminal: reviews and e-mail
```

Then open:

- http://localhost:3000 for the platform site: create an academy there, and the magic link takes you into its Studio
- http://demo.localhost:3000 for the demo academy (enaibler's default theme)
- http://scaling-product.localhost:3000 for tenant 0 (Scaling Product's theme and terminology)

In development, `<slug>.localhost` maps to the tenant with that slug, and new academies get exactly that address. Set `DEV_DEFAULT_TENANT` to serve an academy on plain localhost instead of the platform site. Magic-link e-mails are printed to the console, or caught by Mailpit on http://localhost:8025 if you set `SMTP_URL=smtp://localhost:1025`. Sign in with the address you granted a role to and open `/studio`. Courses from manifests start as drafts: finish and publish one there to see it in the catalogue. Without `LLM_BASE_URL` the worker sends every submission to the review queue.

## Commands

| Command                                         | What it does                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`               | Next.js                                                                                                                                               |
| `npm run worker`                                | pg-boss worker (jobs)                                                                                                                                 |
| `npm run check`                                 | lint, typecheck and all tests                                                                                                                         |
| `npm test -- --project unit`                    | Unit tests (no database needed)                                                                                                                       |
| `npm run test:db`                               | Database tests: set `TEST_DATABASE_URL` (app role) and `TEST_DATABASE_MIGRATION_URL` (owner) against a database prepared by `deploy/postgres/init.sh` |
| `npm run db:generate`                           | Generate a migration from `src/db/schema`                                                                                                             |
| `npm run db:migrate`                            | Apply migrations (schema owner)                                                                                                                       |
| `npm run tenant:validate -- <file>`             | Validate a tenant manifest (errors and warnings)                                                                                                      |
| `npm run tenant:apply -- <file>`                | Apply a tenant manifest to the database                                                                                                               |
| `npm run role:grant -- <tenant> <email> <role>` | Give someone a Studio role (`author`, `reviewer`, `mentor`, `tenant_admin`); `--revoke` removes it                                                    |
| `npm run review:spike -- <folder> [--runs n]`   | AI review spike: agreement, stability, cost and latency on exemplars (needs `LLM_*`)                                                                  |

## Layout

```
config/tenants/      Tenant manifests: tenant 0 (Appendix A) and a local demo
deploy/postgres/     Role and database setup (owner vs. app role, pgvector, pg-boss schema)
docs/                Product brief v2, deployment runbook
drizzle/             Migrations (generated, plus custom: pgvector, FORCE RLS)
scripts/             migrate, tenant-apply, grant-role, review-spike
spikes/review/       Review spike inputs (rubric and exemplars); results/ is gitignored
src/core/            Framework-free domain logic, unit tested: tenant manifest, theme and
                     contrast, fonts, terminology, i18n, wording lint, delivery modes, levels,
                     entry context, rubric, review policy and prompt, credentials, storage
                     keys, roles, lesson progress, publish checklist, starter rubric,
                     brand signals and proposal, academy addresses, public IP check
src/db/              Drizzle schema, client, withTenant(), tenant manifest persistence
src/server/          Server code: tenant resolution, auth, access, email, events, storage, LLM,
                     jobs, learning, review job, credentials, profile, studio queries,
                     platform (academy signup), brand import and its guarded fetch
src/app/(academy)/   Learner-facing pages (tenant brand, DE/EN)
src/app/platform/    Platform site on PLATFORM_HOST: create an academy (enaibler brand, DE/EN)
src/app/studio/      Studio for authors, reviewers and admins (English for now)
src/components/      UI primitives (ui/), Studio pieces (studio/), header, footer, cards
src/proxy.ts         Host → platform site or tenant (Next 16 proxy, Node runtime)
src/worker/          pg-boss worker entry point
tests/db/            Tests against real Postgres (RLS, manifests, funnel, the full learning loop,
                     academy signup and settings)
```

## How it works

**Tenancy.** `src/proxy.ts` resolves the `Host` header to a tenant through `tenant_domains` (cached) and returns 404 for unknown hosts. Server code gets the tenant with `getTenant()` (`src/server/request.ts`). Every query on tenant data runs inside `withTenant(db, tenantId, tx => …)`, which sets `app.tenant_id` for that transaction only. The RLS policies (`tenant_id = current_setting('app.tenant_id')`) and composite foreign keys enforce isolation in the database too. The app connects as `enaibler_app`, which is neither superuser nor BYPASSRLS; the app refuses to start in production otherwise. Migrations run as `enaibler_owner`.

**Self-serve academies.** One deployment serves every academy; creating one never needs a deploy. `src/proxy.ts` rewrites requests on `PLATFORM_HOST` to `src/app/platform` (and answers 404 for `/platform` on academy hosts). The signup action checks the address (DNS-safe, not reserved) and validates the rest with the manifest schema, so the wording lint covers the academy name. `createAcademy` then inserts the tenant, its `<slug>.<ACADEMY_DOMAIN>` domain, the first `tenant_admin` and the accepted terms and DPA (`tenant_agreements`, with version and wording) in one transaction. It never updates an existing academy, so a taken address is an error, not a takeover. Rate limits per IP and per e-mail address and a honeypot field slow down abuse. The new academy's own Better Auth instance sends the magic link, which lands in its Studio with a setup checklist (brand, legal pages, first course, publish). In production, signup stays closed until `PLATFORM_TERMS_URL` and `PLATFORM_DPA_URL` are set.

**Tenant configuration.** Academies change their settings in Studio → Settings (`academy.manage`, tenant admins only). Operators can still use a manifest (`config/tenants/*.yaml`), which declares settings, domains, locales, legal links, features, theme tokens, terminology, paths, levels and course shells. `src/core/tenant/manifest.ts` validates both: strict keys, wording lint on every name that appears on credentials, cross-checks, and non-blocking warnings. `npm run tenant:apply` writes a manifest to the database in one transaction. It replaces settings, theme and terminology, but authored content (course titles, path order) is never overwritten. Publishing a course needs the academy's imprint and privacy page.

**Theme.** Tokens (colours, fonts, radius, border width, shadow, visual style) are validated strictly because they end up in CSS, and they must be readable: text needs 4.5:1 contrast, buttons 3:1. The root layout puts them on `<html style>` as `--tenant-*` variables, and `globals.css` maps them into Tailwind v4 (`bg-primary`, `rounded-card`, `shadow-card`, `font-display` and so on). The visual style (soft or outlined) is expressed in variables too, so any element with `data-theme-scope` and its own `--tenant-*` values renders a different theme. The Studio uses this to stay in enaibler's theme whatever the academy picks, while its previews switch to the academy's theme. Fonts come from a library of open-source families bundled with the app (`src/core/theme/fonts.ts`), never from a font CDN. `src/core/theme/enaibler-tokens.ts` is the default theme.

**Brand import.** Studio → Settings → Brand → "Import from your website". `src/server/brand/safe-fetch.ts` reads the page and its stylesheets: only public addresses (checked on the resolved IPs of every connection and redirect, so DNS rebinding does not help), ports 80 and 443, with size and time limits. `src/core/brand` extracts colours, CSS variables, fonts, radii, borders and shadows and proposes a theme by rules: a brand colour as primary, other hues as accents, a light surface, dark ink, and the closest bundled font for licensed fonts. With `LLM_BASE_URL` set, the model gets only these extracted facts and the proposal, and may refine it. Its answer must pass the theme schema, the font list and the contrast check; otherwise the rule-based proposal stands. The customer sees the result in the live preview with notes, and nothing is saved until they press Save.

**Auth.** `authFor(tenant)` builds a cached Better Auth instance per academy that only accepts that academy's hosts. Every session is stamped with the tenant it was created on, and `getViewer()` ignores sessions from other academies. The magic-link e-mail uses the tenant's template and sender and links to `/sign-in/confirm`. A form POST there calls Better Auth's verify endpoint, so link pre-fetchers do not use up the single-use token.

**Entry and events.** `/start` parses the deep link, drops invalid values, and passes the context along as `?ctx=` through the course page, the sign-in form and the magic-link callback. `/auth/continue` then creates the membership, profile and enrollment and records `signup_completed` and `course_started` with the entry `utm_*` values. The only cookies are the session cookie and a language preference.

**Credentials.** `/verify/<public_id>` shows public credentials to everyone and private ones only to their owner, with a visibility toggle. Everything else looks like "This credential is no longer available". Views, CTA clicks and LinkedIn shares are recorded as events; bots are ignored. Images are rendered with `next/og` from the tenant theme.

**Studio and roles.** Memberships carry roles (`learner`, `author`, `reviewer`, `mentor`, `tenant_admin`); `src/core/access/roles.ts` maps them to capabilities (`studio.view`, `courses.edit`, `courses.publish`, `reviews.decide`, `people.view`, `academy.manage`) and every Studio page and action checks one with `requireCapability()`. Authors see every course with its numbers, drafts included. A course starts from its outcome (what learners build and what good looks like) and a starter rubric; lessons are written against the rubric criteria, and the coverage map shows which criterion is not taught yet. Lessons keep every version. The publish checklist blocks missing languages, texts, lessons and risky wording, and "Preview as learner" shows drafts in every language. Learners appear under a per-academy alias (`L-7K2Q`); names and e-mail addresses only for learners who opted in to be contacted.

**Review job.** Submitting enqueues `review.run` inside the same transaction (job id = submission id, so duplicates are no-ops). The worker reads in one transaction, calls the model outside any transaction, then re-checks and writes in a second one. The routing decides: release (possibly as a spot check) or hold for a human. Released passes issue the credential. Human decisions are new review rows next to the AI review; a changed verdict needs a reason and feeds the agreement rate shown per course.

**AI review.** `src/core/review` holds the rubric model, weighted scoring (pass/fail is computed here, never taken from the model), the §8 routing defaults (spot checks, escalation near the threshold and on the third failed attempt), the versioned prompt with a nonce-tagged data block, and output validation that checks quoted evidence against the submission. `src/server/review/run-ai-review.ts` calls LiteLLM with structured output and retries invalid output.

## Deployment

Coolify on EU servers: see [`docs/deployment.md`](docs/deployment.md). CI (`.github/workflows/ci.yml`) runs lint, types, unit tests, manifest validation and the build. A second job runs migrations and the RLS tests against Postgres 16 with pgvector, prepared by the same `init.sh` as production.

## Known gaps and open items

- **Own domains for self-serve academies:** they live on `<slug>.<ACADEMY_DOMAIN>`. Connecting a customer's domain is still an operator step (manifest domains plus Coolify).
- **Platform legal documents:** enaibler's terms, DPA, privacy page and imprint must exist before signup opens in production (`PLATFORM_*_URL`).
- **Brand tokens:** `src/core/theme/enaibler-tokens.ts` has placeholder values. Replace them with the real `enaibler-tokens.ts`, which is not in this repository.
- **Tenant 0 legal links** in `config/tenants/scaling-product.yaml` point to the home page. Validation warns about this until the exact pages are set.
- **Wording:** `enaibler-landing.html` and the brand guide still say "certified" (brief Appendix B). They are not in this repository.
- **German copy:** "Abschlussbescheinigung" (for "Certificate of Completion") and the use of "du" are proposals and need review, the former by counsel.
- **LinkedIn prefill:** LinkedIn does not guarantee the add-to-profile prefill, so click-test it before release.
- **Open decisions** (brief §15): LLM provider, object storage choice, embedding size (1024 is a placeholder in `src/db/schema/authoring.ts`).
