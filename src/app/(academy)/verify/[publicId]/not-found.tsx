import { getTranslator } from "@/server/request";

/** Private, revoked, deleted or unknown: all look the same from outside (brief §6). */
export default async function CredentialUnavailable() {
  const t = await getTranslator();
  return (
    <div className="mx-auto max-w-xl">
      <p className="card p-6 text-lg">{t.t("verify.unavailable")}</p>
    </div>
  );
}
