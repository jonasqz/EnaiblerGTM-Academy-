import type { Metadata } from "next";

import { LegalDocumentPage } from "@/app/platform/_site/legal-page";
import { legalMetadata } from "@/app/platform/_site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("imprint");
}

/** enaibler's imprint (§ 5 DDG) and its contact points under the DSA, from content/legal. */
export default function ImprintPage() {
  return <LegalDocumentPage page="imprint" />;
}
