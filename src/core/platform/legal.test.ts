import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lintWording } from "@/core/compliance/wording-lint";
import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import {
  agreementsInForce,
  LEGAL_PAGES,
  LEGAL_PATHS,
  legalHref,
  legalPlaceholders,
  parseLegalDocument,
  type LegalDocument,
} from "@/core/platform/legal";

const root = join(__dirname, "../../..");

const doc = (frontMatter: string, body = "## Section\n\nText.") =>
  `---\n${frontMatter}\n---\n\n${body}\n`;

describe("legal documents", () => {
  it("reads title, status, date and the Markdown after the front matter", () => {
    const result = parseLegalDocument(
      doc(
        'title: Impressum\nstatus: draft\nupdated: 2026-09-27\ndescription: "Wer hinter enaibler steht."',
      ),
    );
    expect(result).toEqual({
      ok: true,
      document: {
        title: "Impressum",
        status: "draft",
        updated: "2026-09-27",
        description: "Wer hinter enaibler steht.",
        body: "## Section\n\nText.",
      },
    });
  });

  it("copes with a byte order mark and Windows line endings", () => {
    const source =
      "﻿---\r\ntitle: Terms\r\nstatus: final\r\nupdated: 2026-10-01\r\n---\r\n\r\nText.\r\n";
    const result = parseLegalDocument(source);
    expect(result.ok && result.document).toMatchObject({ status: "final", body: "Text." });
  });

  it("refuses documents it cannot trust to say what is in force", () => {
    const failures = [
      "No front matter at all.",
      doc("title: Terms\nstatus: published\nupdated: 2026-09-27"),
      doc("title: Terms\nstatus: final\nupdated: 27.09.2026"),
      doc("title: Terms\nstatus: final"),
      doc("title: Terms\nstatus: final\nupdated: 2026-09-27\nauthor: Someone"),
      doc("title: [unclosed\nstatus: final\nupdated: 2026-09-27"),
      doc("title: Terms\nstatus: final\nupdated: 2026-09-27", ""),
    ];
    for (const source of failures) {
      expect({ source, ok: parseLegalDocument(source).ok }).toEqual({ source, ok: false });
    }
  });

  it("finds the placeholders the operator still has to fill in, not links", () => {
    const body = [
      "[Company legal name], [Street and number]",
      "See the [privacy policy](/privacy) and [the DPA][dpa].",
      "- [ ] a checkbox",
      "[dpa]: /dpa",
    ].join("\n");
    expect(legalPlaceholders(body)).toEqual(["[Company legal name]", "[Street and number]"]);
  });

  it("links to the operator's own address when one is set, else to the built-in page", () => {
    expect(legalHref("terms", {})).toBe("/terms");
    expect(legalHref("terms", { terms: "https://example.com/agb" })).toBe(
      "https://example.com/agb",
    );
    expect(legalHref("imprint", { terms: "https://example.com/agb" })).toBe("/imprint");
    expect(new Set(Object.values(LEGAL_PATHS)).size).toBe(LEGAL_PAGES.length);
  });
});

describe("signup and the agreements it records", () => {
  const draft = { terms: false, dpa: false };
  const final = { terms: true, dpa: true };

  it("opens in production once both env URLs are set", () => {
    expect(
      agreementsInForce({
        production: true,
        links: { terms: "https://example.com/terms", dpa: "https://example.com/dpa" },
        final: draft,
      }),
    ).toBe(true);
  });

  it("opens in production once both built-in pages are final", () => {
    expect(agreementsInForce({ production: true, links: {}, final })).toBe(true);
  });

  it("takes each document from wherever it is in force", () => {
    expect(
      agreementsInForce({
        production: true,
        links: { dpa: "https://example.com/dpa" },
        final: { terms: true, dpa: false },
      }),
    ).toBe(true);
  });

  it("never opens on a draft", () => {
    expect(agreementsInForce({ production: true, links: {}, final: draft })).toBe(false);
    expect(
      agreementsInForce({ production: true, links: {}, final: { terms: true, dpa: false } }),
    ).toBe(false);
    expect(
      agreementsInForce({
        production: true,
        links: { terms: "https://example.com/terms" },
        final: { terms: false, dpa: false },
      }),
    ).toBe(false);
  });

  it("stays open in development, as before", () => {
    expect(agreementsInForce({ production: false, links: {}, final: draft })).toBe(true);
  });
});

describe("the legal pages in content/legal", () => {
  const documents = LEGAL_PAGES.flatMap((page) =>
    SUPPORTED_LOCALES.map((locale) => {
      const file = `content/legal/${page}.${locale}.md`;
      const result = parseLegalDocument(readFileSync(join(root, file), "utf8"));
      if (!result.ok) throw new Error(`${file}: ${result.error}`);
      return { page, locale, file, document: result.document };
    }),
  );

  /** Heading levels in order: German and English must be built the same way. */
  const outline = (document: LegalDocument) =>
    [...document.body.matchAll(/^(#{1,6}) /gm)].map((match) => match[1]!.length);

  it("exist in every language and are built the same way", () => {
    for (const page of LEGAL_PAGES) {
      const [first, ...others] = documents.filter((entry) => entry.page === page);
      for (const other of others) {
        expect({ file: other.file, outline: outline(other.document) }).toEqual({
          file: other.file,
          outline: outline(first!.document),
        });
      }
    }
  });

  it("leave no placeholder in a final document", () => {
    for (const { file, document } of documents) {
      if (document.status !== "final") continue;
      expect({ file, placeholders: legalPlaceholders(document.body) }).toEqual({
        file,
        placeholders: [],
      });
    }
  });

  it("follow the wording rules (brief §9)", () => {
    for (const { file, document } of documents) {
      const text = `${document.title}\n${document.description ?? ""}\n${document.body}`;
      expect({ file, findings: lintWording(text, "credential_template") }).toEqual({
        file,
        findings: [],
      });
      expect({ file, zertifikat: /zertifikat/i.test(text) }).toEqual({ file, zertifikat: false });
    }
  });

  it("start their body below the page title", () => {
    for (const { file, document } of documents) {
      expect({ file, h1: /^# /m.test(document.body) }).toEqual({ file, h1: false });
    }
  });
});
