import { CircleCheck, Mail, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { confirmNewsAction } from "@/app/(academy)/consent/confirm/actions";
import { getDb } from "@/db/client";
import { marketingLinkValid } from "@/server/consent";
import { getTenant, getTranslator } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  const tenant = await getTenant();
  return {
    title: t.t("consent.confirmTitle", { academy: tenant.settings.author_display_name }),
    robots: { index: false },
    // The token is in the address: never pass it on to another site.
    referrer: "no-referrer",
  };
}

/**
 * Double opt-in (brief §9). Opening the link only asks: mail scanners open
 * links too, so only the button confirms.
 */
export default async function ConfirmNewsPage({ searchParams }: PageProps<"/consent/confirm">) {
  const { token, done } = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const academy = tenant.settings.author_display_name;
  const valid =
    typeof token === "string" && token.length > 0 && token.length <= 64
      ? await marketingLinkValid(getDb(), tenant.id, token)
      : false;

  const result = (ok: boolean) => (
    <div className="card mx-auto max-w-lg space-y-4 p-6 sm:p-8">
      {ok ? (
        <CircleCheck aria-hidden size={32} style={{ color: "var(--status-good)" }} />
      ) : (
        <TriangleAlert aria-hidden size={32} style={{ color: "var(--status-warning)" }} />
      )}
      <h1 className="font-display text-2xl">
        {ok ? t.t("consent.confirmed", { academy }) : t.t("consent.invalid")}
      </h1>
      <p className="text-muted">{ok ? t.t("consent.confirmedBody") : t.t("consent.invalidBody")}</p>
      <Link href="/me#news" className="btn btn-secondary">
        {t.t("consent.toProfile")}
      </Link>
    </div>
  );

  if (done === "1") return result(true);
  if (done === "0" || !valid) return result(false);
  return (
    <form action={confirmNewsAction} className="card mx-auto max-w-lg space-y-4 p-6 sm:p-8">
      <Mail aria-hidden size={32} />
      <h1 className="font-display text-2xl">{t.t("consent.confirmTitle", { academy })}</h1>
      <p className="text-muted">{t.t("consent.confirmBody", { academy })}</p>
      <input type="hidden" name="token" value={token as string} />
      <button type="submit" className="btn btn-primary">
        {t.t("consent.confirmButton")}
      </button>
    </form>
  );
}
