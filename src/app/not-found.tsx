import Link from "next/link";

import { getTranslator } from "@/server/request";

export default async function NotFound() {
  const t = await getTranslator();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-3xl">{t.t("error.notFound")}</h1>
      <Link href="/" className="btn btn-secondary">
        ←
      </Link>
    </div>
  );
}
