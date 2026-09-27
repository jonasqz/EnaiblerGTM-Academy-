import Link from "next/link";

import { getTranslator } from "@/server/request";

export default async function NotFound() {
  const t = await getTranslator();
  return (
    <main className="mx-auto grid w-full max-w-xl flex-1 place-content-center gap-4 px-4 py-24 text-center">
      <p className="font-display text-6xl">404</p>
      <h1 className="text-xl font-semibold">{t.t("error.notFound")}</h1>
      <Link href="/" className="btn btn-secondary mx-auto">
        ←
      </Link>
    </main>
  );
}
