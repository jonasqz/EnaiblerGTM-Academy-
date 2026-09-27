import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { setCredentialVisibility } from "@/app/(academy)/verify/[publicId]/actions";
import { localize } from "@/core/i18n/locales";
import { isBot } from "@/core/shared/bots";
import { pathColor } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { credentialCopy } from "@/server/credential-copy";
import { canView, loadCredential } from "@/server/credentials";
import { trackEvent } from "@/server/events";
import { getOrigin, getTenant, getTranslator } from "@/server/request";

export async function generateMetadata({
  params,
}: PageProps<"/verify/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const tenant = await getTenant();
  const t = await getTranslator();
  const credential = await loadCredential(tenant, publicId);
  // Private by default: nothing about a non-public credential leaks into metadata.
  if (!credential || credential.visibility !== "public")
    return { title: t.term("credential"), robots: { index: false } };

  const copy = credentialCopy(tenant, credential, t, await getOrigin());
  const title = `${copy.credentialTerm}: ${copy.courseTitle}`;
  const description = `${copy.displayName} · ${copy.artifactLine}`;
  const image = { url: `/verify/${credential.publicId}/image?format=og`, width: 1200, height: 630 };
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url: copy.verificationUrl, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/**
 * Verification page (brief §6). Doubles as a landing page for the tenant:
 * the call to action leads new learners into the same course.
 */
export default async function VerifyPage({ params }: PageProps<"/verify/[publicId]">) {
  const { publicId } = await params;
  const tenant = await getTenant();
  const t = await getTranslator();
  const viewer = await getViewer(tenant);
  const credential = await loadCredential(tenant, publicId);
  if (!credential || !canView(credential, viewer?.userId ?? null)) notFound();

  const isOwner = credential.userId === viewer?.userId;
  const copy = credentialCopy(tenant, credential, t, await getOrigin());
  const color = credential.path
    ? pathColor(tenant.theme, credential.path.position, credential.path.color)
    : tenant.theme.colors.primary;

  if (!isOwner && !isBot((await headers()).get("user-agent"))) {
    await withTenant(getDb(), tenant.id, (tx) =>
      trackEvent(tx, {
        tenantId: tenant.id,
        name: "verification_page_viewed",
        courseId: credential.courseId,
        pathId: credential.path?.id,
        locale: t.locale,
      }),
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {isOwner && (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p>
            {credential.visibility === "public"
              ? t.t("verify.publicNotice")
              : t.t("verify.privateNotice")}
          </p>
          <form action={setCredentialVisibility}>
            <input type="hidden" name="publicId" value={credential.publicId} />
            <input
              type="hidden"
              name="visibility"
              value={credential.visibility === "public" ? "private" : "public"}
            />
            <button type="submit" className="btn btn-secondary">
              {credential.visibility === "public"
                ? t.t("verify.makePrivate")
                : t.t("verify.makePublic")}
            </button>
          </form>
        </section>
      )}

      <article className="card overflow-hidden">
        <div className="h-3" style={{ background: color }} />
        <div className="space-y-6 p-6 sm:p-10">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wider opacity-70">
              {copy.credentialTerm}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl">{copy.courseTitle}</h1>
            <p className="text-lg">{copy.artifactLine}</p>
          </header>

          <div className="space-y-1">
            <p className="text-sm opacity-70">{t.t("verify.awardedTo")}</p>
            <p className="font-display text-2xl">{copy.displayName}</p>
            {copy.levelLine && <p>{copy.levelLine}</p>}
            {copy.pathTitle && (
              <p className="text-sm opacity-80">
                {t.term("path")}: {copy.pathTitle}
              </p>
            )}
          </div>

          <p className="opacity-80">{t.t("verify.backedByWork")}</p>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="opacity-70">{t.t("verify.issuedBy", { academy: copy.academy })}</dt>
              <dd>
                {t.t("verify.issuedOn")} {copy.issuedOn}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">{t.t("verify.credentialId")}</dt>
              <dd className="font-mono">{copy.credentialId}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="opacity-70">{t.t("verify.verificationUrl")}</dt>
              <dd className="break-all">{copy.verificationUrl}</dd>
            </div>
          </dl>
        </div>
      </article>

      <div className="flex flex-wrap gap-3">
        {isOwner && credential.visibility === "public" && (
          <>
            <a href={`/verify/${credential.publicId}/share?to=post`} className="btn btn-primary">
              {t.t("verify.share")}
            </a>
            <a
              href={`/verify/${credential.publicId}/share?to=profile`}
              className="btn btn-secondary"
            >
              {t.t("verify.addToProfile")}
            </a>
            <a
              href={`/verify/${credential.publicId}/image?format=card&download=1`}
              className="btn btn-secondary"
            >
              {t.t("verify.downloadCard")}
            </a>
          </>
        )}
        {!isOwner && (
          <a href={`/verify/${credential.publicId}/cta`} className="btn btn-primary">
            {localize(tenant.settings.verification_cta.label, t.locale, [
              tenant.settings.default_locale,
            ])}
          </a>
        )}
      </div>
    </div>
  );
}
