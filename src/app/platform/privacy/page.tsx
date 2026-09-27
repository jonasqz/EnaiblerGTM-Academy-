import type { Metadata } from "next";

import { LegalDocumentPage } from "@/app/platform/_site/legal-page";
import { legalMetadata } from "@/app/platform/_site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("privacy");
}

/** enaibler's privacy policy, for its website, its customers and reporters, from content/legal. */
export default function PrivacyPage() {
  return <LegalDocumentPage page="privacy" />;
}
