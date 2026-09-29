import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { cancelByLinkAction } from "@/app/(academy)/webinars/[slug]/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatWebinarTime } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { getTenant, getTranslator } from "@/server/request";
import { cancelKeyValid } from "@/server/webinars/links";
import { cancellableRegistration } from "@/server/webinars/public";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t.t("webinar.cancelPage.title"), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The cancel link from a webinar mail. It asks before it cancels: mail
 * scanners open links, and must not give anyone's seat away.
 */
export default async function CancelRegistrationPage({
  params,
  searchParams,
}: PageProps<"/webinars/[slug]/cancel">) {
  const { slug } = await params;
  const query = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const back = (
    <Link href={`/webinars/${slug}`} className="btn btn-secondary">
      {t.t("webinar.cancelPage.back")}
    </Link>
  );

  if (query.done === "1") {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="font-display text-3xl">{t.t("webinar.cancelPage.title")}</h1>
        <p role="status" className="card flex items-center gap-2 p-4 font-semibold">
          <CircleCheck aria-hidden size={20} /> {t.t("webinar.cancelPage.done")}
        </p>
        {back}
      </div>
    );
  }

  const r = typeof query.r === "string" ? query.r : "";
  const k = typeof query.k === "string" ? query.k : "";
  const found =
    UUID.test(r) && cancelKeyValid(tenant.id, r, k)
      ? await cancellableRegistration(getDb(), tenant.id, r)
      : null;
  const valid = found?.cancellable && found.webinar.slug === slug && query.invalid !== "1";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl">{t.t("webinar.cancelPage.title")}</h1>
      {valid && found ? (
        <form action={cancelByLinkAction} className="card space-y-4 p-5">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="r" value={r} />
          <input type="hidden" name="k" value={k} />
          <p>
            {t.t("webinar.cancelPage.body", {
              title: found.webinar.title,
              time: formatWebinarTime(
                found.webinar.startsAt,
                found.webinar.durationMinutes,
                found.webinar.timeZone,
                t.locale,
              ),
            })}
          </p>
          <SubmitButton className="btn btn-danger w-full">
            {t.t("webinar.cancelPage.button")}
          </SubmitButton>
        </form>
      ) : (
        <p className="card p-4 font-semibold">{t.t("webinar.cancelPage.invalid")}</p>
      )}
      {back}
    </div>
  );
}
