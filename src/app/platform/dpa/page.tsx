import type { Metadata } from "next";

import { LegalDocumentPage } from "@/app/platform/_site/legal-page";
import { legalMetadata } from "@/app/platform/_site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("dpa");
}

/** The data processing agreement academies accept at signup (Art. 28 GDPR), from content/legal. */
export default function DpaPage() {
  return <LegalDocumentPage page="dpa" />;
}
