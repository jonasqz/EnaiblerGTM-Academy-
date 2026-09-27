# enaibler

Proof-of-work academies. Learners build something real, AI reviews it against a rubric, and the credential is backed by the work.

The product spec is [`docs/product-brief-v2.md`](docs/product-brief-v2.md) (Brief v2, September 2026). Coding assistants should read [`CLAUDE.md`](CLAUDE.md) first.

## Status

This repository covers the brief's MVP (§12) and phase 2: everything except payments. Phase 3 (payments for `paid_live`, team licences, expert academies) is not started; paid courses stay blocked (`src/core/compliance/delivery-mode.ts`).

| Area                                | State                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant, theme, terminology, domains | ✅ Declarative tenant manifests (`config/tenants/*.yaml`) validated by one generic schema; tenant 0 (Appendix A) is pure config, and a test reads Appendix A from the brief. Academies connect their own domain in the Studio (DNS proof, automatic certificates through the proxy).                                                                        |
| Data model with RLS                 | ✅ Drizzle schema for the §4 entities. Postgres RLS is enabled **and forced** on every tenant table, composite foreign keys block cross-tenant links, and tests run against real Postgres.                                                                                                                                                                  |
| Auth                                | ✅ Better Auth magic links, one instance per academy (tenant-bound sessions, host-only cookies), a confirm step against mail scanners, rate limits per IP and per address.                                                                                                                                                                                  |
| Entry                               | ✅ Deep links `/start?path&course&lang&utm_*` carry their context through sign-up in the URL, no tracking cookie. An embeddable path picker (`/embed.js`) brings the academy onto the customer's website.                                                                                                                                                   |
| Learner loop                        | ✅ Catalogue, paths, course page, lesson player (resumable, per-language lessons linked by key) with optional knowledge checks, hand-ins as text, form, link, PDF or images, feedback per criterion, revise and resubmit, a final multiple-choice test where the course ends with one, cohorts joined by link.                                              |
| AI review                           | ✅ `review.run` job: rubric-scored review through LiteLLM, including PDFs and images, §8 routing (spot checks, escalation near the threshold and on repeated fails), human fallback, review queue with decisions and overrides, calibration against the author's exemplars.                                                                                 |
| Credentials                         | ✅ Issued once every required part is passed (the work, the final test or both) and saying which, revoked on a reversed decision, levels on paths. Verification page, OG image, LinkedIn share and add-to-profile, visibility toggle, CTA back into `/start`, a showcase with pictures, signed Open Badges 3.0 (VC-JWT) and an import from other platforms. |
| Authoring                           | ✅ Authors choose how a course ends: real work, a final test or both. Outcome first: rubric drafted from an example, sources (screen recordings → Whisper → steps with screenshots, documents, web pages, an interview), lessons drafted backwards from the rubric, coverage map, versions, preview, publish checklist. Changed web sources flag lessons.   |
| Studio                              | ✅ German and English. Overview with funnel, courses, paths and levels, cohorts with mentors, reviews, people and contacts, settings, brand (logo, own fonts, import from the website), domains, integrations (API keys, webhooks, embed code).                                                                                                             |
| Self-serve academies                | ✅ Customers create an academy on the platform site; it is a database write in the running deployment, never a deploy, and a magic link takes the first admin into the Studio.                                                                                                                                                                              |
| Mail, consent, learner data         | ✅ Review-ready and level-up mails from an outbox, marketing opt-in with double opt-in and a contact export, lead handoff opt-in, "My learning" with export and delete.                                                                                                                                                                                     |
| Jobs, storage, events, operations   | ✅ pg-boss worker (reviews, mail, webhooks, authoring, domain checks, retention), self-hosted S3 (SeaweedFS), product events and funnel, outbound webhooks, cookieless page views (Umami or Plausible), error reports to GlitchTip, JSON logs, AI usage metered per academy (Studio page and operator report).                                              |
| Not started                         | Payments, team licences and expert academies (brief phase 3).                                                                                                                                                                                                                                                                                               |

## Quickstart

```bash
npm install
docker compose up -d                  # Postgres 16 + pgvector (roles via deploy/postgres/init.sh), SeaweedFS (S3) and Mailpit
cp .env.example .env.local
npm run db:migrate                    # as the schema owner (DATABASE_MIGRATION_URL)
npm run tenant:apply -- config/tenants/demo.yaml config/tenants/scaling-product.yaml
npm run role:grant -- demo you@example.com tenant_admin   # your way into the Studio
npm run dev
npm run worker                        # second terminal: reviews, e-mail, webhooks, authoring
```

Then open:

- http://localhost:3000 for the platform site: create an academy there, and the magic link takes you into its Studio
- http://demo.localhost:3000 for the demo academy (enaibler's default theme)
- http://scaling-product.localhost:3000 for tenant 0 (Scaling Product's theme and terminology)

In development, `<slug>.localhost` maps to the tenant with that slug, and new academies get exactly that address. Set `DEV_DEFAULT_TENANT` to serve an academy on plain localhost instead of the platform site. Magic-link e-mails are printed to the console, or caught by Mailpit on http://localhost:8025 if you set `SMTP_URL=smtp://localhost:1025`. Sign in with the address you granted a role to and open `/studio`. Courses from manifests start as drafts: finish and publish one there to see it in the catalogue. Without `LLM_BASE_URL` the worker sends every submission to the review queue.

## Commands

| Command                                             | What it does                                                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                   | Next.js                                                                                                                                               |
| `npm run worker`                                    | pg-boss worker (jobs)                                                                                                                                 |
| `npm run check`                                     | lint, typecheck and all tests                                                                                                                         |
| `npm test -- --project unit`                        | Unit tests (no database needed)                                                                                                                       |
| `npm run test:db`                                   | Database tests: set `TEST_DATABASE_URL` (app role) and `TEST_DATABASE_MIGRATION_URL` (owner) against a database prepared by `deploy/postgres/init.sh` |
| `npm run db:generate`                               | Generate a migration from `src/db/schema`                                                                                                             |
| `npm run db:migrate`                                | Apply migrations (schema owner)                                                                                                                       |
| `npm run tenant:validate -- <file>`                 | Validate a tenant manifest (errors and warnings)                                                                                                      |
| `npm run tenant:apply -- <file>`                    | Apply a tenant manifest to the database                                                                                                               |
| `npm run role:grant -- <tenant> <email> <role>`     | Give someone a Studio role (`author`, `reviewer`, `mentor`, `tenant_admin`); `--revoke` removes it                                                    |
| `npm run review:spike -- <folder> [--runs n]`       | AI review spike: agreement, stability, cost and latency on exemplars (needs `LLM_*`)                                                                  |
| `npm run usage:report -- [--month YYYY-MM] [--csv]` | AI usage and provider cost per academy for a month (default: the last full month), as a table or CSV                                                  |

## Layout

```
config/tenants/      Tenant manifests: tenant 0 (Appendix A) and a local demo
deploy/postgres/     Role and database setup (owner vs. app role, pgvector, pg-boss schema)
deploy/storage/      Object storage (SeaweedFS) as its own Coolify resource
docs/                Product brief v2, deployment runbook
drizzle/             Migrations (generated, plus custom: pgvector, FORCE RLS)
public/embed.js      Path picker loader for the academies' own websites
scripts/             migrate, tenant-apply, grant-role, review-spike
spikes/review/       Review spike inputs (rubric and exemplars); results/ is gitignored
src/core/            Framework-free domain logic, unit tested: tenant manifest, theme and
                     contrast, fonts, terminology, i18n (learner and Studio catalogues), wording
                     lint, delivery modes, levels, entry context, rubric, review policy and
                     prompt, credentials and Open Badges, storage keys and file policy, roles,
                     authoring (drafts, transcripts, auto-update), publish checklist, brand
                     signals, domains, webhooks, consent, notifications, analytics, error events
src/db/              Drizzle schema, client, withTenant(), tenant manifest persistence
src/server/          Server code: tenant resolution, auth, access, email, events, storage and
                     files, LLM, jobs, learning, review job, credentials, authoring, cohorts,
                     domains, webhooks, secrets, consent, profile, studio queries, platform
                     signup, brand import and its guarded fetch, logs and error reports
src/app/(academy)/   Learner-facing pages (tenant brand, DE/EN)
src/app/embed/       The embeddable path picker (framed by other sites)
src/app/platform/    Platform site on PLATFORM_HOST: create an academy (enaibler brand, DE/EN)
src/app/studio/      Studio for authors, reviewers, mentors and admins (DE/EN)
src/app/api/         Uploads, credential import, client errors, health, proxy config
src/components/      UI primitives (ui/), Studio pieces (studio/), header, footer, cards
src/instrumentation.ts  Server error reporting (Next.js onRequestError)
src/proxy.ts         Host → platform site or tenant (Next 16 proxy, Node runtime)
src/worker/          pg-boss worker entry point
tests/db/            Tests against real Postgres (RLS, manifests, the learning loop, files,
                     authoring, calibration, paths, mail, domains, credentials, cohorts,
                     webhooks, auto-update, signup and settings)
```

## How it works

**Tenancy.** `src/proxy.ts` resolves the `Host` header to a tenant through `tenant_domains` (cached) and returns 404 for unknown hosts. Server code gets the tenant with `getTenant()` (`src/server/request.ts`). Every query on tenant data runs inside `withTenant(db, tenantId, tx => …)`, which sets `app.tenant_id` for that transaction only. The RLS policies (`tenant_id = current_setting('app.tenant_id')`) and composite foreign keys enforce isolation in the database too. The app connects as `enaibler_app`, which is neither superuser nor BYPASSRLS; the app refuses to start in production otherwise. Migrations run as `enaibler_owner`.

**Self-serve academies.** One deployment serves every academy; creating one never needs a deploy. `src/proxy.ts` rewrites requests on `PLATFORM_HOST` to `src/app/platform` (and answers 404 for `/platform` on academy hosts). The signup action checks the address (DNS-safe, not reserved) and validates the rest with the manifest schema, so the wording lint covers the academy name. `createAcademy` then inserts the tenant, its `<slug>.<ACADEMY_DOMAIN>` domain, the first `tenant_admin` and the accepted terms and DPA (`tenant_agreements`, with version and wording) in one transaction. It never updates an existing academy, so a taken address is an error, not a takeover. Rate limits per IP and per e-mail address and a honeypot field slow down abuse. The new academy's own Better Auth instance sends the magic link, which lands in its Studio with a setup checklist (brand, legal pages, first course, publish). In production, signup stays closed until `PLATFORM_TERMS_URL` and `PLATFORM_DPA_URL` are set.

**Tenant configuration.** Academies change their settings in Studio → Settings (`academy.manage`, tenant admins only). Operators can still use a manifest (`config/tenants/*.yaml`), which declares settings, domains, locales, legal links, features, theme tokens, terminology, paths, levels and course shells. `src/core/tenant/manifest.ts` validates both: strict keys, wording lint on every name that appears on credentials, cross-checks, and non-blocking warnings. `npm run tenant:apply` writes a manifest to the database in one transaction. It replaces settings, theme and terminology, but authored content (course titles, path order) is never overwritten. Publishing a course needs the academy's imprint and privacy page.

**Theme.** Tokens (colours, fonts, radius, border width, shadow, visual style) are validated strictly because they end up in CSS, and they must be readable: text needs 4.5:1 contrast, buttons 3:1. The root layout puts them on `<html style>` as `--tenant-*` variables, and `globals.css` maps them into Tailwind v4 (`bg-primary`, `rounded-card`, `shadow-card`, `font-display` and so on). The visual style (soft or outlined) is expressed in variables too, so any element with `data-theme-scope` and its own `--tenant-*` values renders a different theme. The Studio uses this to stay in enaibler's theme whatever the academy picks, while its previews switch to the academy's theme. Fonts come from a library of open-source families bundled with the app (`src/core/theme/fonts.ts`), never from a font CDN. `src/core/theme/enaibler-tokens.ts` is the default theme.

**Brand import.** Studio → Settings → Brand → "Import from your website". `src/server/brand/safe-fetch.ts` reads the page and its stylesheets: only public addresses (checked on the resolved IPs of every connection and redirect, so DNS rebinding does not help), ports 80 and 443, with size and time limits. `src/core/brand` extracts colours, CSS variables, fonts, radii, borders and shadows and proposes a theme by rules: a brand colour as primary, other hues as accents, a light surface, dark ink, and the closest bundled font for licensed fonts. With `LLM_BASE_URL` set, the model gets only these extracted facts and the proposal, and may refine it. Its answer must pass the theme schema, the font list and the contrast check; otherwise the rule-based proposal stands. The customer sees the result in the live preview with notes, and nothing is saved until they press Save.

**Auth.** `authFor(tenant)` builds a cached Better Auth instance per academy that only accepts that academy's hosts. Every session is stamped with the tenant it was created on, and `getViewer()` ignores sessions from other academies. The magic-link e-mail uses the tenant's template and sender and links to `/sign-in/confirm`. A form POST there calls Better Auth's verify endpoint, so link pre-fetchers do not use up the single-use token.

**Entry and events.** `/start` parses the deep link, drops invalid values, and passes the context along as `?ctx=` through the course page, the sign-in form and the magic-link callback. `/auth/continue` then creates the membership, profile and enrollment and records `signup_completed` and `course_started` with the entry `utm_*` values. The only cookies are the session cookie and a language preference. The path picker (`/embed/paths`, placed on a website by `public/embed.js`) is the only page other sites may frame: it grows with its content, sets no cookie, and opens `/start` in a new tab with the embed code's language and `utm_*` values.

**Credentials.** `/verify/<public_id>` shows public credentials to everyone and private ones only to their owner, with a visibility toggle. Everything else looks like "This credential is no longer available". Views, CTA clicks and LinkedIn shares are recorded as events; bots are ignored. Images are rendered with `next/og` from the tenant theme. Learners can add a showcase (a short text and up to three pictures), shown only while the page is public. `/verify/<id>/open-badge` hands the owner an Open Badges 3.0 credential as a VC-JWT, signed with the academy's own RSA key (sealed in the database, public key and issuer profile under `/issuer`); the subject is a pseudonym, never the e-mail address. Certificates from another platform come in through `POST /api/credentials/import` (API key) or a JSON file in the Studio, idempotently and with their original dates.

**Studio and roles.** The Studio speaks German or English (the team member's choice, independent of the academy's languages; words in `src/core/i18n/studio`). Memberships carry roles (`learner`, `author`, `reviewer`, `mentor`, `tenant_admin`); `src/core/access/roles.ts` maps them to capabilities (`studio.view`, `courses.edit`, `courses.publish`, `reviews.decide`, `people.view`, `academy.manage`) and every Studio page and action checks one with `requireCapability()`. Authors see every course with its numbers, drafts included. A course starts from its outcome (what learners build and what good looks like) and a starter rubric; lessons are written against the rubric criteria, and the coverage map shows which criterion is not taught yet. Lessons keep every version. The publish checklist blocks missing languages, texts, lessons and risky wording, and "Preview as learner" shows drafts in every language. Learners appear under a per-academy alias (`L-7K2Q`); names and e-mail addresses only for learners who opted in to be contacted. Mentors belong to a cohort and see and review only its learners.

**How a course ends.** Authors choose per course (`completion_mode`): real work reviewed against the rubric (the default), a final multiple-choice test, or both. `completeCourse` issues the Certificate of Completion once every required part is passed, in either order, and the credential records how it was earned: the verification page, card, "My learning" and the Open Badge say "Final Test passed" and never name work nobody handed in. The final test is graded on the server; learners get the questions without the answer key (`publicTestQuestions`), may retake it (ten attempts an hour), and see which questions were wrong when the authors allow it. Lessons can end with a knowledge check: a few questions for practice, checked in the browser, never stored. Changing how a published course ends only works once the new part is ready, and learners who already passed everything the new ending asks for get their credential. The home page promises only what every published course keeps.

**AI usage.** Every model call is metered for the academy that caused it (`ai_usage`: kind, course, tokens, seconds of audio, the gateway's cost), in a transaction of its own right after the call, so failed runs count too. Studio → Settings → Usage shows the academy its AI reviews per course and month and what the team used for authoring, as amounts; costs are for the operator (`npm run usage:report`), ahead of pricing AI review separately.

**Review job.** Submitting enqueues `review.run` inside the same transaction (job id = submission id, so duplicates are no-ops). The worker reads in one transaction, calls the model outside any transaction, then re-checks and writes in a second one. The routing decides: release (possibly as a spot check) or hold for a human. Released passes issue the credential. Human decisions are new review rows next to the AI review; a changed verdict needs a reason and feeds the agreement rate shown per course.

**AI review.** `src/core/review` holds the rubric model, weighted scoring (pass/fail is computed here, never taken from the model), the §8 routing defaults (spot checks, escalation near the threshold and on the third failed attempt), the versioned prompt with a nonce-tagged data block, and output validation that checks quoted evidence against the submission. `src/server/review/run-ai-review.ts` calls LiteLLM with structured output and retries invalid output.

**Files.** Uploads go to the app (`/api/uploads`, outside the tenant proxy so bodies are not buffered), never straight to the bucket. `src/core/files/policy.ts` says per purpose what a file may contain, how large it may be and who may read it back; types come from the content, not the name, and author metadata is stripped (images are re-encoded, PDFs lose their document info). Keys start with `tenants/<id>/`. Downloads (`/files/<id>`) check access on every request: only brand assets, path pictures and lesson media are public, and showcase pictures while their page is.

**Authoring with AI.** Sources are read by the worker: documents and web pages to text, recordings through Whisper into steps with a screenshot at each step change, and an interview in which the AI asks the author targeted questions. Text is chunked and, with an embedding model, embedded for retrieval. "Draft lessons" writes lessons backwards from the rubric criteria and keeps which sources each lesson draws on; every AI run records model, prompt version, tokens and cost. Web page sources are read again every day; a changed page flags the lessons based on it until an author marks them as reviewed.

**Mail and consent.** Mail to learners (feedback ready, a new level) is written to an outbox in the transaction of what it reports and sent by the worker with retries; whoever saw the result on the page gets no mail. Marketing mail needs a separate double opt-in, recorded with the wording shown; the academy exports its confirmed contacts as CSV. The lead-handoff opt-in ("may contact me") is a third, separate consent.

**Own domains.** An academy claims a domain in the Studio and proves control with a TXT record; the worker checks DNS every ten minutes. Verified domains land in `tenant_domains`, the reverse proxy fetches routes and certificates from `/api/internal/proxy/*`, and the academy's other addresses redirect to its main one.

**Integrations.** Webhooks: an event recorded with `trackEvent` also queues a delivery for every subscribed endpoint, in the same transaction; the worker signs it (HMAC-SHA256) and sends it through `safePost` with backoff over a day. Learners are a stable pseudonym; their e-mail address only goes out with their contact consent or in consent events. API keys (per academy, per scope, stored hashed) authenticate the credential import.

**Operations.** Page views go to the operator's Umami or Plausible, sent by hand with the path only. Errors from requests (`src/instrumentation.ts`), from the worker's jobs and from browsers go to GlitchTip in the Sentry format, scrubbed of e-mail addresses, tokens and query strings. Server logs are JSON lines in production.

## Deployment

Coolify on EU servers: see [`docs/deployment.md`](docs/deployment.md). CI (`.github/workflows/ci.yml`) runs lint, types, unit tests, manifest validation and the build. A second job runs migrations and the RLS tests against Postgres 16 with pgvector, prepared by the same `init.sh` as production.

## Known gaps and open items

- **Payments** and everything that depends on them (paid courses, team licences, expert academies) are brief phase 3.
- **Platform legal documents:** enaibler's terms, DPA, privacy page and imprint must exist before signup opens in production (`PLATFORM_*_URL`).
- **Brand tokens:** `src/core/theme/enaibler-tokens.ts` has placeholder values. Replace them with the real `enaibler-tokens.ts`, which is not in this repository.
- **Tenant 0 legal links** in `config/tenants/scaling-product.yaml` point to the home page. Validation warns about this until the exact pages are set.
- **Wording:** `enaibler-landing.html` and the brand guide still say "certified" (brief Appendix B). They are not in this repository.
- **German copy:** "Abschlussbescheinigung" (for "Certificate of Completion"), the use of "du" and the Studio's German are proposals and need review, the first by counsel.
- **LinkedIn prefill:** LinkedIn does not guarantee the add-to-profile prefill, so click-test it before release.
- **Open decisions** (brief §15): LLM provider and embedding size (1024 is a placeholder in `src/db/schema/authoring.ts`). Object storage is decided: SeaweedFS (see `docs/deployment.md`).
