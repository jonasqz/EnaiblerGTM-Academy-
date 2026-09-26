import type { Metadata } from "next";

import { sanitizeVerifyParams } from "@/server/magic-link-confirm";
import { getTenant, getTranslator } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t.t("nav.signIn"), robots: { index: false } };
}

/** One click to sign in; see server/magic-link-confirm.ts for why this step exists. */
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/sign-in/confirm">) {
  const raw = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const entries = Object.entries(raw).flatMap(([key, value]) =>
    typeof value === "string" ? [[key, value] as [string, string]] : [],
  );
  const params = sanitizeVerifyParams(entries);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl">
        {t.t("signIn.title", { academy: tenant.settings.author_display_name })}
      </h1>
      {params ? (
        <form method="post" action="/api/sign-in/confirm">
          {[...params.entries()].map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <button type="submit" className="btn btn-primary w-full">
            {t.t("email.magicLink.button")}
          </button>
        </form>
      ) : (
        <p className="card p-4 font-semibold">{t.t("signIn.linkExpired")}</p>
      )}
    </div>
  );
}
