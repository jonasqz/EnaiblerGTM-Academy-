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
- **Events:** record them with `trackEvent(tx, …)` inside the transaction of the action they describe, using names from `src/core/events/names.ts`. Skip bots (`isBot`) on public pages.
- **AI review:** pass/fail is computed from rubric scores (`scoreRubric`), never taken from the model. Bump `REVIEW_PROMPT_VERSION` on any prompt change.
- Comments explain why, not what. Match the surrounding style.

## Stack notes (September 2026 versions)

- **Next.js 16:**
  - Middleware is `src/proxy.ts` (Node runtime, can query Postgres).
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
- Open decisions are in brief §15. The 1024 embedding size in `src/db/schema/authoring.ts` follows decision #1.
