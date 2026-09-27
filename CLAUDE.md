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
6. **Proof over points; gamification is optional.** Paths and levels sit behind `features.paths` and `features.levels`, and a plain catalogue must keep working.

## Multi-tenancy rules

- **Always use `withTenant`.** Read and write tenant data only inside `withTenant(db, tenant.id, async (tx) => …)` (`src/db/tenant-scope.ts`), never through the bare `db`. RLS will hide the rows anyway, but code must not rely on that.
- **Where the tenant comes from.** Get it from `getTenant()` (pages, route handlers, server actions) or `resolveTenant(host)`. Never take it from request parameters.
- **The platform host has no tenant.** Requests on `PLATFORM_HOST` are rewritten to `src/app/platform` (self-serve signup). There `getSurface()` returns `{ kind: "platform" }` and `getTenant()` answers 404. Academies are created only by `createAcademy` (`src/server/platform/academies.ts`), which never updates an existing tenant: a taken address is an error, never a takeover.
- **Global tables have no RLS:** `tenants`, `tenant_domains` and the Better Auth tables (`user`, `session`, `account`, `verification`).
- **Adding a tenant-scoped table:**
  - add a `tenant_id uuid not null` foreign key to `tenants`;
  - add `tenantIsolation()` to the extra config and call `.enableRLS()`;
  - reference parents through `(tenant_id, parent_id)` composite foreign keys, which needs `unique(tenant_id, id)` on the parent;
  - add a custom migration that repeats `drizzle/0002_force_rls.sql`, because drizzle-kit cannot emit `FORCE ROW LEVEL SECURITY`.

  `tests/db/rls.test.ts` fails if a table misses RLS.

- **Database roles.** The app connects as `enaibler_app` (never superuser, never BYPASSRLS; `assertRlsEnforced` refuses in production). Migrations and manifests run as `enaibler_owner` (`DATABASE_MIGRATION_URL`).
- **Object storage.** Build keys with `src/core/storage/keys.ts`, which enforces the `tenants/<id>/` prefix.
- **Background jobs** (pg-boss) carry `tenantId`, must be idempotent, and open their own `withTenant` transaction.
- **Auth.** `authFor(tenant)` gives the academy's Better Auth instance. Use `getViewer(tenant)` for the signed-in user; it ignores sessions from other academies.
- **Roles.** Capabilities come from membership roles (`src/core/access/roles.ts`). Studio pages and every Studio server action call `requireCapability(capability, next)` from `src/server/access.ts`; learner pages that need a session use `requireViewer(next)`. Academy settings and the brand need `academy.manage` (tenant admins). Grant roles with `npm run role:grant`.
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
  - The Studio renders in enaibler's theme (`DEFAULT_THEME`) whatever the academy picks. Only its previews (preview as learner, the lesson preview, the brand editor) use the academy's theme.
  - A theme with contrast errors (`themeContrastIssues`: text 4.5:1, buttons 3:1) is rejected everywhere: manifests, the brand editor and the brand import.
  - Fonts come only from `FONT_LIBRARY` (`src/core/theme/fonts.ts`). To add one, install its `@fontsource/*` package, add it to the library and import its CSS in `src/app/fonts.ts`.
- **Customer-supplied URLs** are fetched only through `safeFetchText` and posted to only through `safePost` (webhooks), both in `src/server/brand/safe-fetch.ts`: public addresses checked on the resolved IPs of every connection and redirect, ports 80 and 443, size and time limits. Never `fetch()` such a URL directly. `SAFE_FETCH_ALLOWED_HOSTS` exists for local tests only.
- **Events:** record them with `trackEvent(tx, …)` inside the transaction of the action they describe, using names from `src/core/events/names.ts`. Skip bots (`isBot`) on public pages.
- **Studio** (`src/app/studio`) is the author tool and English-only for now; learner-facing pages live in `src/app/(academy)` and stay DE/EN.
- **Forms with server actions:** use `useActionForm` (`src/components/ui/use-action-form.ts`) when a form returns validation errors. React 19 resets `<form action={fn}>` after every action, which would wipe what the person typed. Plain one-button forms can keep `action={serverAction}`.
- **Comparing JSON from the database:** `jsonb` does not keep key order, so compare with `sameJson` (`src/core/shared/json.ts`), never `JSON.stringify(a) === JSON.stringify(b)`.
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
- The German credential term and "du" copy are proposals pending review.
- Tenant 0 legal links in its manifest are placeholders; validation warns about them.
- Self-serve academies live on `<slug>.<ACADEMY_DOMAIN>`. Custom domains, logo upload and own fonts are not built yet.
- Open decisions are in brief §15. The 1024 embedding size in `src/db/schema/authoring.ts` follows decision #1.
