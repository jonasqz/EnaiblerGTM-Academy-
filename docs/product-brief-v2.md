# enaibler — Product & Dev Brief v2

**Status:** MVP spec · September 2026 · supersedes v1
**For:** Coding assistant and anyone building enaibler. Read together with `CLAUDE.md`.
**First design partner:** Scaling Product (tenant 0). Their brief describes *their* needs; this document turns those needs into a generic product. Appendix A shows how Scaling Product becomes pure configuration.

---

## 0. What changed from v1

| Topic | v1 | v2 |
|---|---|---|
| Core idea | AI turns your content into courses | **Proof-of-work academies:** learners build something real, AI reviews it, the credential is backed by the work |
| Course ending | Quiz | **Assignment + rubric-based AI review** (revise and resubmit) |
| Wording | "certified academy", "ESG Strategy Certified" | **"Certificate of Completion". Never "certified" / "zertifiziert"** (legal risk in DACH) |
| Authoring | Content → course (RAG) | **Outcome-first:** define the artifact and rubric, then AI drafts lessons backwards. Sources now include screen recordings |
| Customisation | Colour theme | **Full tenant config:** theme tokens incl. radii/borders/shadows/fonts, terminology, domains, locales, legal links, features |
| Gamification | None | **Optional modules:** paths ("characters") and levels |
| Stack | React + Tailwind, Python backend | **Fully self-hostable on Coolify:** Next.js + Tailwind, Postgres, Better Auth, S3-compatible storage, Postgres-based job queue, self-hosted analytics |

Unchanged: **domain expertise first.** Free domain courses drive reach and authority; product training is a later track type.

---

## 1. Positioning

**One line:** enaibler turns expertise into academies where learners build real work and share the proof.

**Tagline candidates:** "Learn it. Build it. Prove it." · "Academies that end in real work."

**Why proof of work is the next level:**
- A quiz badge is a cheap signal. A credential that says "built a validated idea brief" is worth sharing and worth reading.
- For the tenant, every finished artifact is evidence that *their method works*. That is the strongest marketing a knowledge business can have.
- For enaibler, AI review is the hard, defensible part. Course generation alone is becoming a commodity; reliable, cheap, rubric-based feedback on real work is not.

---

## 2. The core loop (identical for every tenant)

```
Entry ──► Path ──► Lessons ──► Assignment ──► AI review ◄──► Revise
  ▲                                               │
  │                                               ▼
Verification page ◄── Share ◄── Credential ◄── Pass (+ level-up)
```

What enaibler guarantees at each step:

1. **Entry:** zero-friction start from the tenant's own website (deep link or embed), carrying path, course, language and UTM context through sign-up.
2. **Path:** an optional, ordered set of courses with an identity the learner chooses.
3. **Lessons:** short, mobile-friendly, resumable.
4. **Assignment:** exactly one required artifact per course.
5. **Review:** feedback within minutes, per rubric criterion, with a clear path to pass.
6. **Credential:** issued automatically, private until the learner makes it public.
7. **Share:** one click to LinkedIn post and LinkedIn profile.
8. **Verification page:** doubles as a **landing page for the tenant** with a configurable call to action ("Start this course"). This closes the loop: every shared card is a new entry point.

---

## 3. Product principles

1. **Generic core, tenant configuration.** Test for every string, colour, rule or name: if it belongs to one customer, it is config, not code.
2. **Proof over points.** Progress is earned through submitted work, not clicks.
3. **Outcome-first authoring.** Authors define what the learner must produce before writing lessons.
4. **Private by default, public by choice.** Credentials, names and artifacts are never public without learner opt-in.
5. **Compliance is a feature.** EU hosting, safe wording, delivery-mode rules and data rights are built into the platform, so tenants get them for free.
6. **Tenant brand in front, enaibler behind.** The only enaibler mark learners see is "Powered by enaibler".
7. **Gamification is optional.** Paths and levels are modules a tenant can switch off; a plain course catalogue must still work.

---

## 4. Domain model

Every table carries `tenant_id`. All learner-facing text fields are localised (`{ de: "...", en: "..." }`).

| Entity | Key fields | Notes |
|---|---|---|
| **Tenant** | slug, domains[], locales[], default_locale, theme, terminology, author_display_name, legal_links {imprint, privacy, terms}, features {paths, levels, cohorts, ai_review, showcase}, email_sender, verification_cta | `author_display_name` is a brand ("Scaling Product Academy"), never a person |
| **Theme** | colors {ink, surface, card, primary, accents[]}, fonts {display, body, source_urls}, radius, border_width, shadow {x, y, blur, color}, visual_style | Must express both enaibler's default (rounded, soft shadows) and tenant 0 (square, 3px outline, zero-blur offset shadow) |
| **Terminology** | overrides for keys like `path`, `artifact`, `level`, `credential` | Defaults: Track, Deliverable, Level, Certificate of Completion. Tenant 0: Character, Loot |
| **Path** | title, promise, visual {svg, png}, color, course_ids (ordered) | Optional module |
| **LevelScheme** | levels [{n, name, rule}] | Rule types: `courses_completed_in_path >= n`, `path_complete`, `manual_grant`. Optional module |
| **Course** | slug, title, languages[], delivery_mode, status, version, est_minutes, assignment_id | `delivery_mode`: `free_async` \| `paid_live` \| `paid_async_approved` (see §9) |
| **Lesson** | course_id, order, title, blocks (Markdown, image, video), locale, version history | |
| **Assignment** | prompt, artifact_name, submission_types (file: pdf/image/md, template_form: JSON schema, url), rubric_id | Exactly one required per course |
| **Rubric** | criteria [{id, label, description, weight, score_descriptors}], pass_threshold, exemplars[], review_policy | `review_policy`: mode (`ai_auto` \| `ai_then_human` \| `human_only`), spot_check_rate, escalate_on |
| **Submission** | learner_id, assignment_id, attempt_no, files/form data, status | Status: submitted → in_review → needs_revision / passed / overridden |
| **Review** | submission_id, reviewer_type (ai/human), per-criterion {score, evidence, feedback}, overall, model, prompt_version, cost | Human override keeps the AI review for audit |
| **Enrollment** | learner_id, course_id, lesson_progress, started_at, completed_at, entry_context (path, lang, utm_*) | |
| **Credential** | public_id, learner_id, course_id, path_id, level_at_issue, artifact_name, display_name, issued_at, visibility, source (native/imported), ob3_json | `display_name` exactly as entered by the learner |
| **Membership** | user_id, role, scope | Roles: learner, author, reviewer, mentor (cohort-scoped), tenant_admin. Later: team_admin |
| **Cohort** *(phase 2)* | course_id, dates, members, mentors | |
| **Event** | name, tenant, course, path, locale, utm_*, timestamp | See §10 |

---

## 5. Learner experience (MVP)

- **Entry:** `/start?path=<id>&course=<slug>&lang=<de|en>&utm_*`. All parameters optional; context survives sign-up and is stored on the enrollment.
- **Auth:** email magic link only (Better Auth magic-link plugin). No passwords.
- **Path and profile:** choose a path (if enabled); profile shows path, level, completed courses, credentials, and data export/delete.
- **Course player:** Markdown lessons with images and short videos, progress saved per lesson, resume where you left off, excellent on mobile.
- **Assignment:** upload a file (PDF, image, .md) or fill a structured template form. See review status live.
- **Feedback:** per-criterion scores with concrete, actionable feedback. Revise and resubmit without limit.
- **Completion:** level-up moment (if levels enabled), credential issued, share flow opens.
- **UI languages:** DE and EN for all learner-facing UI; courses can exist in one or both.

---

## 6. Credentials and sharing (MVP)

- **Verification page** at `<tenant-domain>/verify/<public_id>`: learner name, path visual, "Level N · <level name>" (if enabled), course title, "<artifact term>: <artifact name>", issue date, credential ID, verification URL, "Certificate of Completion", "Powered by enaibler", plus the tenant's **call to action**.
- **Images:** server-rendered from theme + path visual. 1200×630 for link previews (OG tags), 1200×848 for the card download.
- **Visibility:** private by default. Learner can make it public and later private again. Deleted accounts show "This credential is no longer available".
- **LinkedIn:** "Add to profile" via LinkedIn's add-certification URL (organisation, issue month/year, credential URL and ID — verify the current parameters when implementing) and a share-post button.
- **Portability:** Open Badges 3.0 JSON export (nice to have in MVP, required in phase 2). **Import endpoint** for credentials issued elsewhere, so a tenant can launch on another platform and migrate later.
- **Showcase** *(phase 2)*: learner can opt in to show an excerpt of their artifact on the verification page. Proof you can see is the strongest share.

---

## 7. Authoring — enaibler's core differentiator

The goal: an expert produces a good course clearly faster than writing it from scratch.

**Outcome-first flow**

1. **Define the outcome.** Name the artifact and describe it. AI drafts a rubric (criteria, descriptors, pass threshold) from the description and one example of good work. Author edits.
2. **Add sources.** Any mix of:
   - **Screen recording with narration** → transcription (EU) → topic segments → keyframe screenshots at step changes.
   - **Documents and URLs** (blog posts, whitepapers, frameworks) → extraction and chunking.
   - **Expertise interview:** AI asks the author targeted questions ("What do beginners get wrong?", "What does your approach do that others don't?") and uses the answers as source.
3. **AI drafts lessons backwards from the rubric.** Each lesson maps to one or more criteria. A **coverage map** flags gaps ("No lesson teaches criterion 3").
4. **Edit.** Markdown editor with image upload and version history.
5. **Calibrate the review.** Before publishing, run the AI review against good and bad exemplars. The author sees whether the AI agrees with their judgement and tunes the rubric.
6. **Preview as learner, then publish.** Unpublish at any time.

**Later:** auto-update. Watch sources for changes, flag affected lessons for review.

---

## 8. AI review

- **Inputs:** assignment prompt, rubric, exemplars, submission (text extracted from PDF/.md; images via vision; form fields as structured data).
- **Output:** structured JSON: per criterion {score, evidence quoted from the submission, one actionable improvement}, overall pass/fail, short summary. Tone configurable per tenant.
- **Safety:** treat the submission strictly as data (prompt-injection defence), fixed and versioned prompts, low temperature, schema-validated output with retry.
- **Human in the loop:** review policy per rubric. Default recommendation until data says otherwise:
  - 100 % human spot check of the first 20 passes per course,
  - then 20 %, dropping to 10 % once AI–human agreement is ≥ 90 %,
  - always escalate scores within ±10 % of the threshold and the third failed attempt.
- **Author tools:** review queue, override with reason, agreement-rate dashboard per course.
- **Economics:** log tokens and cost for every review. Target under €0.10 per review; validate in the October spike.

---

## 9. Compliance and trust (platform level — not legal advice; confirm with counsel)

- **EU hosting:** everything self-hosted on EU servers under our control (app, database, files, analytics, transcription). The only external processors are the LLM provider (EU region or zero-retention terms) and the email relay. DPA with each, plus with the server host.
- **Delivery mode rules (FernUSG):** free courses may be self-paced (`free_async`). Paid courses stay blocked until payments ship. `paid_live` must not promise recordings. `paid_async_approved` requires the tenant to confirm ZFU approval.
- **Wording guardrail:** a per-locale lint list (e.g. certified, certification, zertifiziert, Zertifizierung, accredited, akkreditiert, staatlich anerkannt). **Blocked** in credential templates, course titles and path names; **warning** in lesson text.
- **Anonymity mode:** no person names in UI, emails, metadata or credentials; strip author metadata from uploaded files.
- **Email:** transactional (magic link, review ready, level-up) separate from marketing. Marketing only with double opt-in, sent from the tenant's sender identity.
- **Data rights:** learner can export (JSON + files) and delete all data.
- **Lead handoff** *(phase 2)*: only with an explicit, separate opt-in ("Scaling Product may contact me").

---

## 10. Analytics

Cookieless, EU-hosted. Every event carries tenant, course, path, locale and entry `utm_*` values.

`signup_started`, `signup_completed`, `course_started`, `lesson_completed`, `assignment_submitted`, `review_completed`, `review_overridden`, `review_passed`, `course_completed`, `level_up`, `credential_made_public`, `credential_shared_linkedin`, `verification_page_viewed`, `verification_cta_clicked`

**Tenant dashboard (MVP-light):** funnel entry → start → submit → pass → public → shared → verification views → CTA clicks.
**Phase 2:** outbound webhooks per event (e.g. consented `course_completed` → CRM).

---

## 11. Architecture

**Principle:** every component runs as a service on **Coolify** on EU servers we control. No managed backend services. The only external dependencies are the LLM provider and an email relay, both swappable.

| Area | Decision |
|---|---|
| Platform | **Coolify** on EU VPS (e.g. Hetzner). Start with one server for app + DB; add a worker/GPU server when transcription load needs it. Deploy from Git, one Coolify project per environment (staging, production) |
| Frontend + API | **Next.js** (App Router) + Tailwind, TypeScript, one app container. **Theme via CSS variables** resolved from tenant tokens at request time; Tailwind classes reference the variables. `enaibler-tokens.ts` becomes the *default tenant theme* |
| Database | **Postgres** (Coolify service) with **pgvector** for source retrieval. **Drizzle ORM** with migrations in the repo |
| Tenancy | Host-based resolution in Next.js middleware (custom domain → tenant). App-level: every query goes through a tenant-scoped helper. Defence in depth: **Postgres RLS** keyed on `current_setting('app.tenant_id')`, set per transaction |
| Custom domains | Coolify's proxy (Traefik) with Let's Encrypt. MVP: tenant domains added to the app via the Coolify UI or API during tenant setup. Later: automate through the Coolify API as part of self-serve onboarding |
| Auth | **Better Auth** with the magic-link plugin; tables live in our Postgres. One global user with per-tenant memberships and roles; sessions are cookie-scoped per tenant domain. Magic-link email is sent with the tenant's template and sender, resolved from the request host. **Spike in October:** confirm Better Auth handles many custom domains (trusted origins, cookie domain) cleanly |
| Object storage | **S3-compatible storage** self-hosted on Coolify (e.g. MinIO, Garage or SeaweedFS — check current licensing/distribution before choosing). Paths prefixed by tenant. Signed URLs for private files |
| Jobs | **pg-boss** (queue in Postgres, no Redis needed) with a separate worker container from the same repo. Jobs: transcription, keyframes, lesson drafting, review, image rendering, emails. Idempotent, retryable |
| Transcription | **Self-hosted Whisper** (faster-whisper) as its own Coolify service; CPU for MVP volumes, GPU server if needed. Keeps author recordings on our servers |
| LLM | **LiteLLM** proxy on Coolify as the gateway: routes to an EU-region or zero-retention provider, swappable later for self-hosted open models. Logs model, prompt version, tokens and cost per call |
| Email | Transactional email via an EU SMTP relay (self-hosting outbound mail hurts deliverability). Templates with React Email. Marketing opt-ins stored in our DB; the tenant decides where marketing mail is sent from |
| Analytics | **Umami or Plausible Community Edition** on Coolify (cookieless) for page views, plus our own `events` table in Postgres for product events and the tenant funnel |
| Images | Server-side rendering of OG and card images in Next.js (Satori-based). Path visuals uploaded as SVG, rasterised to PNG and cached in storage |
| Observability | Uptime Kuma for health checks; GlitchTip (Sentry-compatible) for errors; structured logs |
| Backups | Coolify scheduled Postgres backups to an off-server S3 bucket (different provider/location). Restore tested before tenant 0 goes live |
| i18n | Learner UI strings per locale, overridable per tenant through the terminology layer |

---

## 12. Scope

**MVP (mid-December 2026)**
Tenant, theme, terminology and domain system · magic-link auth and deep-link entry · paths and levels (optional modules) · course player · assignments with file and form submission · AI review with rubric, review queue and override · credentials, verification page, images, LinkedIn buttons, visibility control · authoring: recording → draft, Markdown editor with versions, rubric editor, calibration, preview, publish · wording lint, delivery modes, data export/delete · events and a basic funnel view · DE/EN.

**Phase 2 (Q1–Q2 2027)**
Cohorts and mentor role · OB 3.0 required · showcase · webhooks and CRM handoff with consent · embeddable path picker · auto-update from sources · self-serve onboarding for tenant 2+.

**Phase 3 (from October 2027, after legal green light)**
Payments for `paid_live` · team licences and team admin · expert academies (see earlier roadmap discussion).

**Not planned:** forums or chat, hosting recordings of paid live sessions.

---

## 13. Build order

| When | Milestone |
|---|---|
| October 2026 | Coolify setup (staging + production, backups, monitoring), data model with RLS, Better Auth, tenant/theme/terminology system, custom domains. **Spikes:** Better Auth across custom domains; recording → Whisper → lesson draft; AI review quality and cost on real exemplars |
| November 2026 | Course player, assignments, AI review + queue, credentials, verification page, images, LinkedIn |
| **Mid-December 2026** | **MVP complete.** Tenant 0 live on staging, quiz handoff working |
| **Mid-January 2027** | **Tenant 0 course 1 live** |
| March 2027 | Tenant 0 course 2; onboard a second tenant with a different theme to prove the config model |
| May 2027 | Cohorts and mentor role |

If the build slips, tenant 0 may launch course 1 elsewhere; the credential import endpoint must accept those credentials later.

---

## 14. Success metrics

**Per tenant:** entry → course start · start → completion · share rate (public or LinkedIn) · verification views per shared card · CTA clicks.
**Platform:** author minutes per finished lesson (vs. from scratch) · AI–human review agreement · cost per review · time from submission to feedback.

---

## 15. Open decisions

1. LLM provider behind LiteLLM (EU region or zero-retention terms); when to test self-hosted open models for review.
2. Server sizing: does Whisper run acceptably on CPU for course-1 volumes, or do we need a GPU server early?
3. Object storage choice (MinIO vs. Garage vs. SeaweedFS) after checking current licensing.
4. Final tagline and positioning copy (landing page and brand guide still say "certified").
5. Showcase privacy details: what exactly may be shown, and can the tenant see artifacts of private credentials?
6. Pricing model once paid tiers exist (per learner, per tenant, per review volume).

---

## Appendix A — Tenant 0 as configuration (Scaling Product)

Nothing below is code. If implementing it requires a code change, the generic model is missing something.

```yaml
tenant:
  slug: scaling-product
  domains: [academy.scaling-product.com]
  locales: [de, en]
  default_locale: de
  author_display_name: "Scaling Product Academy"
  legal_links:
    imprint: "<tenant URL>"
    privacy: "<tenant URL>"
    terms: "<tenant URL>"
  features: { paths: true, levels: true, cohorts: false, ai_review: true, showcase: false }
  verification_cta: { label: { en: "Start this course", de: "Kurs starten" }, url: "<tenant URL>" }

theme:
  colors:
    ink: "#2E2A36"
    surface: "#F3EBDD"   # paper
    card: "#FBF6EC"
    primary: "#DD7F6C"   # accent
    accents: ["#E6C878", "#93C6BF", "#AE9FD6", "#3B3553"]  # mustard, teal, lavender, plum
  fonts: { display: "Bungee", body: "Rubik" }
  radius: 0
  border_width: 3px
  shadow: { x: 4px, y: 4px, blur: 0, color: "#2E2A36" }  # hard offset; match the website's CLAUDE.md

terminology:
  path: { en: "Character", de: "Charakter" }
  artifact: { en: "Loot", de: "Loot" }

paths: [Validator, Builder, Scaler, Navigator]   # course order per path: set by author

levels:
  - { n: 1, name: Apprentice,   rule: "courses_completed_in_path >= 1" }
  - { n: 2, name: Practitioner, rule: "courses_completed_in_path >= 2" }
  - { n: 3, name: Pro,          rule: "path_complete" }
  - { n: 4, name: Mentor,       rule: "manual_grant" }

courses:
  - { slug: validation-lab,         delivery_mode: free_async, launch: 2027-01 }
  - { slug: market-sizing-with-ai,  delivery_mode: free_async, launch: 2027-03 }
```

## Appendix B — Known inconsistencies to fix

- `enaibler-landing.html` and `enaibler_brand_guide.pdf` use "certified" in the tagline and examples → rewrite with the new positioning.
- `enaibler-tokens.ts` is enaibler's own look → keep as the default tenant theme and extend with radius, border width and shadow tokens.
- v1 architecture listed Python/FastAPI; an earlier v2 draft used Supabase → both replaced by the self-hosted Coolify stack in §11.
- Scaling Product brief, open question 4 ("one Supabase project per tenant?") → answered by §11: one shared Postgres with tenant scoping and RLS.
