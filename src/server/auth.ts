import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";

import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { account, session, user, verification } from "@/db/schema";
import { sendEmail, senderFor } from "@/server/email/mailer";
import { renderMagicLinkEmail } from "@/server/email/templates/magic-link";
import { env, isProduction } from "@/server/env";

/**
 * Better Auth, one instance per academy (brief §11: magic links only, one
 * global user, sessions cookie-scoped per tenant domain).
 *
 * Why per tenant: each instance only accepts its tenant's hosts
 * (`baseURL.allowedHosts`), so magic links, redirects and trusted origins
 * always stay on the academy's own domain, and the magic-link e-mail is
 * rendered with that tenant's template and sender. Cookies are host-only.
 */
export const MAGIC_LINK_TTL_MINUTES = 15;

function allowedHosts(tenant: TenantContext): string[] {
  const hosts = [...tenant.settings.domains];
  if (!isProduction()) {
    const { DEV_PORT, DEV_DEFAULT_TENANT } = env();
    hosts.push(`${tenant.slug}.localhost:${DEV_PORT}`);
    if (DEV_DEFAULT_TENANT === tenant.slug) hosts.push(`localhost:${DEV_PORT}`);
  }
  return hosts;
}

/**
 * The link in the e-mail points at our confirm page instead of Better Auth's
 * verify endpoint: mail scanners that pre-fetch links would otherwise burn the
 * single-use token before the learner clicks.
 */
export function confirmUrlFor(verifyUrl: string): string {
  const url = new URL(verifyUrl);
  return `${url.origin}/sign-in/confirm?${url.searchParams.toString()}`;
}

function createTenantAuth(tenant: TenantContext) {
  return betterAuth({
    appName: tenant.settings.author_display_name,
    secret: env().BETTER_AUTH_SECRET,
    baseURL: { allowedHosts: allowedHosts(tenant), protocol: env().APP_PROTOCOL },
    basePath: "/api/auth",
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    session: {
      additionalFields: {
        tenantId: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Bind every session to the academy it was created on.
          before: async (data) => ({ data: { ...data, tenantId: tenant.id } }),
        },
      },
    },
    advanced: { cookiePrefix: "enaibler" },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, metadata }) => {
          const t = tenantTranslator(tenant, metadata?.locale);
          const rendered = await renderMagicLinkEmail({
            tenant,
            t,
            url: confirmUrlFor(url),
            expiresInMinutes: MAGIC_LINK_TTL_MINUTES,
          });
          const from = senderFor(tenant);
          await sendEmail({ to: email, from, replyTo: from.replyTo, ...rendered });
        },
      }),
      nextCookies(),
    ],
  });
}

export type TenantAuth = ReturnType<typeof createTenantAuth>;

const instances = new Map<string, { auth: TenantAuth; fingerprint: string }>();

/** Cached per tenant; rebuilt when the tenant's config changes (e.g. a new domain). */
export function authFor(tenant: TenantContext): TenantAuth {
  const fingerprint = JSON.stringify(tenant);
  const cached = instances.get(tenant.id);
  if (cached?.fingerprint === fingerprint) return cached.auth;
  const auth = createTenantAuth(tenant);
  instances.set(tenant.id, { auth, fingerprint });
  return auth;
}

export interface Viewer {
  userId: string;
  email: string;
  name: string;
}

/** The signed-in learner, if the session belongs to this academy. */
export async function getViewer(tenant: TenantContext): Promise<Viewer | null> {
  const result = await authFor(tenant).api.getSession({ headers: await headers() });
  if (!result || result.session.tenantId !== tenant.id) return null;
  return { userId: result.user.id, email: result.user.email, name: result.user.name };
}
