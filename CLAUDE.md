# Working on enaibler

The spec is [`docs/product-brief-v2.md`](docs/product-brief-v2.md). Read the relevant section before you change behaviour. This file covers how we build it. [`README.md`](README.md) has the overview and the commands.

## Non-negotiables (from the brief)

1. **Generic core, tenant configuration.** If a string, colour, rule or name belongs to one customer, it goes in a tenant manifest (`config/tenants/*.yaml`, validated by `src/core/tenant/manifest.ts`), not in code. If a tenant needs a code change, extend the generic model instead. `src/core/tenant/manifest.test.ts` validates Appendix A straight from the brief.
2. **Never "certified" / "zertifiziert".** The credential is a "Certificate of Completion" ("Abschlussbescheinigung"). `src/core/compliance/wording-lint.ts` blocks certification and accreditation wording in anything that appears on a credential: titles, path and level names, terminology, brand name, CTA. It warns in lesson text. Don't bypass it, and keep UI copy clean too.
3. **Private by default.** Credentials, names and artifacts are never public without the learner opting in. To anyone else, a non-public credential looks exactly like a deleted one: "This credential is no longer available".
4. **Tenant brand in front.** The only enaibler mark learners see is "Powered by enaibler". Anonymity: no person names in UI, e-mails, metadata or credentials. Senders and issuers are brands (`author_display_name`).
5. **Compliance is a feature.**
   - Everything is self-hosted in the EU.
   - Fonts are bundled or served from our own storage; third-party font CDNs are rejected by the theme schema.
   - No tracking cookies: only the session and a language preference. Entry context travels in URLs.
   - FernUSG delivery modes: paid courses are blocked until payments ship (`src/core/compliance/delivery-mode.ts`).
6. **Proof over points; gamification is optional.** Paths and levels sit behind `features.paths` and `features.levels`, and a plain catalogue must keep working. Real work is the default way to finish a course; authors may choose a final test or both instead (brief §16).

## Multi-tenancy rules

- **Always use `withTenant`.** Read and write tenant data only inside `withTenant(db, tenant.id, async (tx) => …)` (`src/db/tenant-scope.ts`), never through the bare `db`. RLS will hide the rows anyway, but code must not rely on that.
- **Where the tenant comes from.** Get it from `getTenant()` (pages, route handlers, server actions) or `resolveTenant(host)`. Never take it from request parameters.
- **The platform host has no tenant.** Requests on `PLATFORM_HOST` are rewritten to `src/app/platform` (enaibler's website and the self-serve signup). There `getSurface()` returns `{ kind: "platform" }` and `getTenant()` answers 404. Academies are created only by `createAcademy` (`src/server/platform/academies.ts`), which never updates an existing tenant: a taken address is an error, never a takeover.
- **Global tables have no RLS:** `tenants`, `tenant_domains` and the Better Auth tables (`user`, `session`, `account`, `verification`).
- **Adding a tenant-scoped table:**
  - add a `tenant_id uuid not null` foreign key to `tenants`;
  - add `tenantIsolation()` to the extra config and call `.enableRLS()`;
  - reference parents through `(tenant_id, parent_id)` composite foreign keys, which needs `unique(tenant_id, id)` on the parent;
  - add a custom migration that repeats `drizzle/0002_force_rls.sql`, because drizzle-kit cannot emit `FORCE ROW LEVEL SECURITY`.

  `tests/db/rls.test.ts` fails if a table misses RLS.

- **Database roles.** The app connects as `enaibler_app` (never superuser, never BYPASSRLS; `assertRlsEnforced` refuses in production). Migrations and manifests run as `enaibler_owner` (`DATABASE_MIGRATION_URL`).
- **Object storage.** Build keys with `src/core/storage/keys.ts`, which enforces the `tenants/<id>/` prefix. Store files only through `storeFile` (`src/server/files.ts`): it checks the type from the content, enforces sizes and strips author metadata. What each purpose may contain and who may read it back is in `src/core/files/policy.ts`; the bucket is never public, and downloads go through `/files/<id>`, which checks access every time. `/api/uploads` is outside the proxy's matcher (bodies must not be buffered) and resolves the academy itself.
- **Domains.** `tenant_domains` is global routing (no RLS); `domain_claims` are an academy's pending claims (RLS). A domain an academy verified has `verified_at` set and is removable in the Studio; manifest domains are not. The tenant cache lives on `globalThis` so every module layer sees the same entries, and `/api/internal/*` (proxy config) is outside the proxy's matcher and needs `PROXY_CONFIG_TOKEN`.
- **Background jobs** (pg-boss) carry `tenantId`, must be idempotent, and open their own `withTenant` transaction. Work "for every academy" goes through the worker's `forEachTenant`, so one academy's failure does not stop the others.
- **Auth.** `authFor(tenant)` gives the academy's Better Auth instance. Use `getViewer(tenant)` for the signed-in user; it ignores sessions from other academies.
- **Roles.** Capabilities come from membership roles (`src/core/access/roles.ts`). Studio pages and every Studio server action call `requireCapability(capability, next)` from `src/server/access.ts`; learner pages that need a session use `requireViewer(next)`. Academy settings and the brand need `academy.manage` (tenant admins). Admins manage the team in Studio → Settings → Team through `src/server/team.ts` (invitations by mail, role changes, removal; an academy always keeps an admin). `npm run role:grant` stays for operators and uses the same code.
- **Settings have two writers.** Tenant admins edit settings and theme in Studio → Settings (`src/server/studio/academy.ts`, validated as a manifest, address fixed). `tenant:apply` replaces settings, theme and terminology from the file, so never re-apply an old manifest to an academy that is managed in the Studio.
- **Learners in the Studio** appear under `learnerAlias()`. Show a name or e-mail address only for learners with a confirmed, unrevoked `lead_handoff` consent (see `src/server/studio/insights.ts`).

## Code conventions

- **`src/core`** is framework-free and pure: no database, no Next.js, no `process.env`. Unit tests sit next to the code (`*.test.ts`), and every rule from the brief gets one.
- **`src/server`** is server code. Modules that use `next/headers` import `"server-only"`. Anything the worker or `scripts/` import must not use `"server-only"` or `next/*`.
- **Validation** uses Zod 4 `strictObject`, with config shorthands normalised by transforms. For nested defaults use `.prefault({})`: in Zod 4, `.default()` returns the value without parsing the inner schema.
- **Learner-facing text:**
  - Content is `LocalizedText` (`{ de, en }`).
  - UI strings live in `src/core/i18n/messages.ts`, and TypeScript enforces both locales.
  - Tenant nouns come in through `{term.path}` / `{terms.course}` placeholders or `t.term()`.
  - German copy uses "du".
- **Theme values** reach CSS only through `src/core/theme` (validated tokens → `--tenant-*` variables → Tailwind `@theme inline` in `src/app/globals.css`).
  - Utilities: `bg-primary`, `text-ink`, `bg-card`, `rounded-card`, `shadow-card`, `border-outline` (width), `border-line` (colour), `font-display`.
  - Component classes: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`.
  - Visual-style behaviour (hover, lift, press) is in variables too, never in selectors on `<html>`. So an element with `data-theme-scope` and `style={themeToCssVariables(theme)}` renders another theme.
  - The Studio renders in enaibler's theme (`DEFAULT_THEME`) whatever the academy picks. Only its previews (preview as learner, the lesson preview, the brand editor) use the academy's theme, and their learner text comes from `messages.ts` in a language the academy offers (`tenantTranslator`).
  - A theme with contrast errors (`themeContrastIssues`: text 4.5:1, buttons 3:1) is rejected everywhere: manifests, the brand editor and the brand import.
  - Fonts come only from `FONT_LIBRARY` (`src/core/theme/fonts.ts`). To add one, install its `@fontsource/*` package, add it to the library and import its CSS in `src/app/fonts.ts`.
- **Customer-supplied URLs** are fetched only through `safeFetchText` and posted to only through `safePost` (webhooks), both in `src/server/brand/safe-fetch.ts`: public addresses checked on the resolved IPs of every connection and redirect, ports 80 and 443, size and time limits. Never `fetch()` such a URL directly. `SAFE_FETCH_ALLOWED_HOSTS` exists for local tests only.
- **Events:** record them with `trackEvent(tx, …)` inside the transaction of the action they describe, using names from `src/core/events/names.ts`. Skip bots (`isBot`) on public pages. `trackEvent` also queues the academy's webhooks (`src/server/webhooks.ts`) in that transaction: payloads name the learner by a pseudonym, and carry the e-mail address only with a `lead_handoff` consent or in consent events.
- **Stored secrets** (signing keys, webhook secrets) are sealed with `sealSecret` / `openSecret` (`src/server/secrets.ts`, key from `DATA_ENCRYPTION_SECRET`); API keys are stored as hashes. Secrets are shown once.
- **Framing:** only `/embed/*` may be framed by other sites (`Content-Security-Policy: frame-ancestors` in `next.config.ts`). Embedded pages set no cookie (the proxy does not persist `?lang` there), and their links open in a new tab without prefetching.
- **Observability:** report errors with `reportError` (`src/server/observability/report.ts`, Sentry format for GlitchTip, scrubbed; no Sentry SDK) and log with `log` (`src/server/observability/log.ts`) in server and worker code. Page views go only through `PageAnalytics` (manual tracking, path only); pages whose address carries a token get `Referrer-Policy: no-referrer`.
- **Studio** (`src/app/studio`) speaks German and English, the team member's choice. Its words live in `src/core/i18n/studio/<area>.ts` (TypeScript enforces both languages; keys start with the area): use `getStudioText()` on the server and `useStudioText()` in client components, `t.n()` for counts and `t.date()` for dates (Berlin time by default). Core rules and background jobs report by code and the Studio words them (`publishIssueText`, `wordingText`, `jobErrorText`, `manifestWarningText`, `contrastIssueText` in `src/core/i18n/studio/helpers.ts`); store codes, never English sentences. Learner-facing pages live in `src/app/(academy)` and use `src/core/i18n/messages.ts`.
- **Forms with server actions:** use `useActionForm` (`src/components/ui/use-action-form.ts`) when a form returns validation errors. React 19 resets `<form action={fn}>` after every action, which would wipe what the person typed. Plain one-button forms can keep `action={serverAction}`.
- **Comparing JSON from the database:** `jsonb` does not keep key order, so compare with `sameJson` (`src/core/shared/json.ts`), never `JSON.stringify(a) === JSON.stringify(b)`.
- **How a course ends** is its `completion_mode` (`src/core/courses/completion.ts`): `work`, `test` or `work_and_test`. Credentials are issued only by `completeCourse` (`src/server/courses/completion.ts`), called in the transaction of each passed part and when a new ending asks for less; it waits until every required part is passed and records how the credential was earned (`basis`). Say it on the credential through `src/core/credentials/proof.ts`, never name work nobody handed in, and offer the showcase only for credentials earned with work. A published course switches only to an ending whose parts are ready (`endingIssues`), and nothing is deleted on a switch.
- **Questions** (`src/core/questions/questions.ts`): lesson knowledge checks are practice, checked in the browser and never stored. The final test is graded on the server; learners get its questions only through `publicTestQuestions`, never the answer key, and see which questions were wrong only when the authors allow it.
- **AI usage is metered.** Wrap every model caller with `meteredLlm`, or give Whisper and embeddings a `usageMeter`, at the call site where academy and course are known (`src/server/ai-usage.ts`, kinds in `src/core/usage/ai-usage.ts`). Recording never fails the work it measures. The metering path also checks the academy's monthly AI allowance before each call (`src/server/ai-allowance.ts`, rules in `src/core/usage/allowance.ts`) and throws `AiAllowanceUsedUp`, a permanent job failure: the review holds the hand-in for a person (`ai_allowance_used_up`), jobs stop with the code, helpers fall back and say why. The allowance is the operator's alone (`tenants.ai_allowance_micro_usd`, `AI_MONTHLY_ALLOWANCE_USD`), never in the manifest or the Studio settings. Academies see how much they used and the share of their allowance, never amounts; provider costs stay in the operator report (`npm run usage:report`).
- **Sharing** (`src/core/credentials/share.ts`): every link a learner shares carries its channel (`sharedUrl`, `?via=post|profile`), and the certificate page's button carries it on into `/start` as `utm_*` (`buildVerificationCtaUrl`). Attribution travels in URLs, never in cookies. Views and clicks go through `recordLandingEvent`: never for the owner, bots skipped. The suggested post and hashtags are held to credential wording; academies edit them in Studio → Settings → Sharing (`updateSharingSettings`, validated as a manifest).
- **Leads** are learners with a confirmed, unrevoked `lead_handoff` consent (`src/server/studio/leads.ts`). A lead who came through someone's shared certificate is shown with that certificate's course, never with the person who shared it. The academy's news is always a separate opt-in: unticked, then double opt-in.
- **enaibler's website** (`src/app/platform`): its words live in `src/core/i18n/site`, the same shape in both languages (`site.test.ts`), and it claims only what the product does today. Screens come from a fictional demo academy, never from a customer. Link between its pages with plain anchors: they sit behind the proxy's rewrite, outside the typed routes. Its legal pages are Markdown in `content/legal` (`<page>.<locale>.md`, `status: draft | final`, `src/core/platform/legal.ts`): a draft carries a banner, is never indexed and never opens signup, and a final page has no `[placeholder]` left. Academy pages carry a "Report content" link to the website's `/report` (DSA notice and action) next to "Powered by enaibler", only with a platform host.
- **AI review:** pass/fail is computed from rubric scores (`scoreRubric`), never taken from the model. Bump `REVIEW_PROMPT_VERSION` on any prompt change.
- **AI brand import:** the model only sees extracted facts (colours, fonts, radii), never the page. Its answer must pass the theme schema, the font list and the contrast check, or the rule-based proposal stands. Bump `BRAND_PROMPT_VERSION` on any prompt change.
- **Publishing** needs the academy's imprint and privacy page (`legal_pages_missing` in the publish checklist).
- Comments explain why, not what. Match the surrounding style.

## Stack notes (September 2026 versions)

- **Next.js 16:**
  - Middleware is `src/proxy.ts` (Node runtime, can query Postgres).
  - In the proxy, read environment variables by name (`process.env.PLATFORM_HOST`). Code that passes `process.env` as a whole (for example to `env()`) did not see them there, so anything the proxy imports reads its variables by name (`src/server/platform/config.ts`).
  - Build proxy rewrites with `new URL(target, request.url)`, not from `request.nextUrl`, and keep `HOSTNAME=0.0.0.0` for the standalone server. Otherwise the rewrite leaves Next's own origin and is proxied as an external request.
  - `params`, `searchParams`, `headers()` and `cookies()` are async.
  - `PageProps<"/route">`, `LayoutProps` and `RouteContext` are generated, so `npm run typecheck` runs `next typegen` first.
  - `agentRules: false` stops `next dev` from writing agent files over this one.
- **Tailwind v4** uses CSS-first config. **ESLint 9** with flat config: `eslint-config-next` 16 crashes on ESLint 10.
- **Better Auth 1.7** checks the schema at runtime, so keep `src/db/schema/auth.ts` in sync with its core tables. Magic-link tokens are single-use and stored hashed.
- **Drizzle 0.45 / drizzle-kit 0.31:** run `npm run db:generate` after schema changes and commit the SQL and `meta/`. CI fails on drift.
- **pg-boss 12:**
  - It uses a named export (`PgBoss`).
  - Queues must exist before `send`; the worker creates them from `QUEUE_OPTIONS`.
  - Handlers receive arrays of jobs.
  - Set `createSchema: false`: the schema comes from `deploy/postgres/init.sh`.
- **Vitest 5** has two projects: `unit` and `db`. DB tests skip unless the `TEST_DATABASE_*` variables are set.

## Before you push

```bash
npm run lint && npm run typecheck && npm test -- --project unit && npm run build
npm run test:db        # when you touched src/db, migrations or anything tenant-scoped
```

## Open items to keep in mind

- `src/core/theme/enaibler-tokens.ts` holds placeholder brand values until the real `enaibler-tokens.ts` is added.
- The German credential term, the "du" copy and the Studio's German are proposals pending review.
- Tenant 0 legal links in its manifest are placeholders; validation warns about them.
- Payments, team licences and expert academies (brief phase 3) are not built; paid courses stay blocked.
- Open decisions are in brief §15. The 1024 embedding size in `src/db/schema/authoring.ts` follows decision #1. Object storage is SeaweedFS (`deploy/storage`).
