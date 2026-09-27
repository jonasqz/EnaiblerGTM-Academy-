import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import {
  agreementsInForce,
  LEGAL_PATHS,
  parseLegalDocument,
  type LegalDocument,
  type LegalPage,
} from "@/core/platform/legal";
import { isProduction } from "@/server/env";
import { reportError } from "@/server/observability/report";
import { platformOrigin, type PlatformConfig } from "@/server/platform/config";

/*
 * enaibler's legal pages, read from content/legal on request. The files ship
 * with the build (outputFileTracingIncludes in next.config.ts), so a new text
 * goes live with a deploy, after CI has checked it.
 */

const DIRECTORY = join(process.cwd(), "content", "legal");

/** Recorded for the operator's own documents when PLATFORM_AGREEMENT_VERSION is unset. */
const DEFAULT_AGREEMENT_VERSION = "2026-09";

/** A page in one language; null when its file is missing or broken (reported). */
export async function loadLegalDocument(
  page: LegalPage,
  locale: Locale,
): Promise<LegalDocument | null> {
  const file = `${page}.${locale}.md`;
  let source: string;
  try {
    source = await readFile(join(DIRECTORY, file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const parsed = parseLegalDocument(source);
  if (parsed.ok) return parsed.document;
  await reportError(new Error(`content/legal/${file}: ${parsed.error}`), {
    runtime: "web",
    route: LEGAL_PATHS[page],
  });
  return null;
}

/** The languages in which a built-in page is in force. */
export async function finalLocales(page: LegalPage): Promise<Locale[]> {
  const documents = await Promise.all(
    SUPPORTED_LOCALES.map((locale) => loadLegalDocument(page, locale)),
  );
  return SUPPORTED_LOCALES.filter((_, index) => documents[index]?.status === "final");
}

async function finalEverywhere(page: LegalPage): Promise<boolean> {
  return (await finalLocales(page)).length === SUPPORTED_LOCALES.length;
}

/**
 * Signup needs somewhere to create academies and, in production, terms and a
 * DPA in force for the admin to accept (the rule: core/platform/legal.ts).
 */
export async function signupOpen(config: PlatformConfig | null): Promise<boolean> {
  if (!config) return false;
  const [terms, dpa] = await Promise.all([finalEverywhere("terms"), finalEverywhere("dpa")]);
  return agreementsInForce({
    production: isProduction(),
    links: config.links,
    final: { terms, dpa },
  });
}

export interface AcceptedDocument {
  /** The address the form linked to; built-in pages in the admin's language. */
  url: string;
  version: string;
}

/**
 * What a new academy's admin accepts, for tenant_agreements: where each text
 * was and which version of it. A built-in page's version is its date, so a
 * new text is a new version without anyone bumping a variable.
 */
export async function acceptedDocuments(
  config: PlatformConfig,
  locale: Locale,
): Promise<Record<"terms" | "dpa", AcceptedDocument>> {
  const accepted = async (page: "terms" | "dpa"): Promise<AcceptedDocument> => {
    const own = config.links[page];
    if (own) return { url: own, version: config.agreementVersion ?? DEFAULT_AGREEMENT_VERSION };
    const document = await loadLegalDocument(page, locale);
    return {
      url: `${platformOrigin(config)}${LEGAL_PATHS[page]}?lang=${locale}`,
      version: config.agreementVersion ?? document?.updated ?? DEFAULT_AGREEMENT_VERSION,
    };
  };
  const [terms, dpa] = await Promise.all([accepted("terms"), accepted("dpa")]);
  return { terms, dpa };
}
