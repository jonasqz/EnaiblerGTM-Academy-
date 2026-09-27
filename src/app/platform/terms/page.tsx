import type { Metadata } from "next";

import { LegalDocumentPage } from "@/app/platform/_site/legal-page";
import { legalMetadata } from "@/app/platform/_site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("terms");
}

/** The terms of use academies accept at signup, from content/legal. */
export default function TermsPage() {
  return <LegalDocumentPage page="terms" />;
}
