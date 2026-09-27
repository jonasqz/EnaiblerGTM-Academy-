import { createHash, randomBytes } from "node:crypto";

import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import {
  canConfirm,
  CONFIRM_LINK_TTL_DAYS,
  consentState,
  type ConsentState,
} from "@/core/consent/marketing";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import { consents, learnerProfiles, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { sendEmail, senderFor } from "@/server/email/mailer";
import { renderNoticeEmail } from "@/server/email/templates/notice";
import { academyUrl } from "@/server/platform/config";
import { queueWebhookEvent } from "@/server/webhooks";

/*
 * Consent to hear from the academy (brief §9). Marketing needs double
 * opt-in: the request stores the exact wording, only the mailed link
 * confirms it. Lead handoff is its own opt-in (see server/profile.ts).
 */

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** One confirmation mail per minute at most, however often the button is pressed. */
const RESEND_AFTER_MS = 60_000;

export async function loadMarketingConsent(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<{ state: ConsentState; confirmedAt: Date | null }> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.kind, "tenant_marketing"))),
  );
  return { state: consentState(row, new Date()), confirmedAt: row?.confirmedAt ?? null };
}

export type MarketingRequest =
  | { status: "confirmation_needed"; token: string }
  | { status: "recently_sent" }
  | { status: "already_confirmed" };

/** Starts (or restarts) the double opt-in; the token goes out by mail and is stored hashed. */
export async function requestMarketingConsent(
  db: Database,
  tenantId: string,
  userId: string,
  wording: string,
): Promise<MarketingRequest> {
  return withTenant(db, tenantId, async (tx) => {
    const now = new Date();
    const [row] = await tx
      .select()
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.kind, "tenant_marketing")))
      .for("update");
    const state = consentState(row, now);
    if (state === "confirmed") return { status: "already_confirmed" };
    if (state === "pending" && now.getTime() - row!.requestedAt.getTime() < RESEND_AFTER_MS) {
      return { status: "recently_sent" };
    }
    const token = randomBytes(24).toString("base64url");
    const values = {
      wording,
      requestedAt: now,
      confirmTokenHash: hashToken(token),
      confirmedAt: null,
      revokedAt: null,
    };
    await tx
      .insert(consents)
      .values({ tenantId, userId, kind: "tenant_marketing", ...values })
      .onConflictDoUpdate({
        target: [consents.tenantId, consents.userId, consents.kind],
        set: values,
      });
    return { status: "confirmation_needed", token };
  });
}

/** Whether a confirmation link would still work (the page asks before it confirms). */
export async function marketingLinkValid(
  db: Database,
  tenantId: string,
  token: string,
): Promise<boolean> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(consents)
      .where(
        and(eq(consents.kind, "tenant_marketing"), eq(consents.confirmTokenHash, hashToken(token))),
      ),
  );
  return canConfirm(row, new Date());
}

/** The click in the confirmation mail. Single use; expired or unknown links do nothing. */
export async function confirmMarketingConsent(
  db: Database,
  tenantId: string,
  token: string,
): Promise<boolean> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(consents)
      .where(
        and(eq(consents.kind, "tenant_marketing"), eq(consents.confirmTokenHash, hashToken(token))),
      )
      .for("update");
    if (!row || !canConfirm(row, new Date())) return false;
    await tx
      .update(consents)
      .set({ confirmedAt: new Date(), confirmTokenHash: null })
      .where(eq(consents.id, row.id));
    await queueWebhookEvent(tx, {
      tenantId,
      type: "marketing_consent_confirmed",
      userId: row.userId,
    });
    return true;
  });
}

/** Unsubscribes, or cancels a confirmation that is still pending. */
export async function withdrawMarketingConsent(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const withdrawn = await tx
      .update(consents)
      .set({ revokedAt: new Date(), confirmTokenHash: null })
      .where(
        and(
          eq(consents.userId, userId),
          eq(consents.kind, "tenant_marketing"),
          isNull(consents.revokedAt),
        ),
      )
      .returning({ confirmedAt: consents.confirmedAt });
    // Only a confirmed subscription reached anyone's list; a cancelled request did not.
    if (withdrawn[0]?.confirmedAt) {
      await queueWebhookEvent(tx, { tenantId, type: "marketing_consent_withdrawn", userId });
    }
  });
}

export async function sendMarketingConfirmation(
  tenant: TenantContext,
  input: { to: string; token: string; locale: string },
): Promise<void> {
  const t = tenantTranslator(tenant, input.locale);
  const academy = tenant.settings.author_display_name;
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject: t.t("email.news.subject", { academy }),
    heading: t.t("email.news.heading"),
    paragraphs: [t.t("email.news.body", { academy })],
    button: {
      label: t.t("email.news.button"),
      url: academyUrl(tenant, `/consent/confirm?token=${input.token}`),
    },
    note: t.t("email.news.note", { days: CONFIRM_LINK_TTL_DAYS }),
  });
  const from = senderFor(tenant);
  await sendEmail({
    to: input.to,
    from: { name: from.name, address: from.address },
    replyTo: from.replyTo,
    ...rendered,
    headers: { "Auto-Submitted": "auto-generated" },
  });
}

export type ContactList = "tenant_marketing" | "lead_handoff";

export interface Contact {
  email: string;
  name: string | null;
  locale: string | null;
  wording: string;
  requestedAt: Date;
  confirmedAt: Date;
}

/** Everyone with a confirmed, unrevoked consent of this kind, for the academy's own tools. */
export async function listContacts(
  db: Database,
  tenantId: string,
  list: ContactList,
): Promise<Contact[]> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        email: user.email,
        name: learnerProfiles.displayName,
        locale: learnerProfiles.locale,
        wording: consents.wording,
        requestedAt: consents.requestedAt,
        confirmedAt: consents.confirmedAt,
      })
      .from(consents)
      .innerJoin(user, eq(user.id, consents.userId))
      .leftJoin(
        learnerProfiles,
        and(
          eq(learnerProfiles.tenantId, consents.tenantId),
          eq(learnerProfiles.userId, consents.userId),
        ),
      )
      .where(
        and(eq(consents.kind, list), isNotNull(consents.confirmedAt), isNull(consents.revokedAt)),
      )
      .orderBy(asc(consents.confirmedAt)),
  );
  return rows.map((row) => ({ ...row, name: row.name || null, confirmedAt: row.confirmedAt! }));
}

/** How many learners each list has, for the Studio. */
export async function countContacts(
  db: Database,
  tenantId: string,
): Promise<Record<ContactList, number>> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ kind: consents.kind, n: sql<number>`count(*)::int` })
      .from(consents)
      .where(and(isNotNull(consents.confirmedAt), isNull(consents.revokedAt)))
      .groupBy(consents.kind),
  );
  const count = (kind: ContactList) => rows.find((row) => row.kind === kind)?.n ?? 0;
  return { tenant_marketing: count("tenant_marketing"), lead_handoff: count("lead_handoff") };
}
