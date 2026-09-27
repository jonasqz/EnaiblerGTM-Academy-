import type { Metadata } from "next";

import { SignInForm } from "@/app/(academy)/sign-in/sign-in-form";
import { decodeEntryContext, encodeEntryContext, safeNextPath } from "@/core/entry/context";
import { getTenant, getTranslator } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t.t("nav.signIn"), robots: { index: false } };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { ctx, error, next } = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const entry = decodeEntryContext(typeof ctx === "string" ? ctx : null);
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  const academy = tenant.settings.author_display_name;
  // The academy's news are for learners, not for its team on the way into the Studio.
  const studio = nextPath === "/studio" || Boolean(nextPath?.startsWith("/studio/"));

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl">{t.t("signIn.title", { academy })}</h1>
      {error ? (
        <p className="card p-4 font-semibold">{t.t("signIn.linkExpired")}</p>
      ) : (
        <p>{t.t("signIn.intro")}</p>
      )}
      <SignInForm
        ctx={entry ? encodeEntryContext(entry) : null}
        next={nextPath}
        labels={{
          email: t.t("signIn.emailLabel"),
          submit: t.t("signIn.submit"),
          sending: t.t("signIn.sending"),
          sent: t.t("signIn.sent", { email: "{email}" }),
          news: studio ? null : t.t("me.newsLabel", { academy }),
          newsNext: t.t("signIn.newsNext"),
        }}
      />
    </div>
  );
}
