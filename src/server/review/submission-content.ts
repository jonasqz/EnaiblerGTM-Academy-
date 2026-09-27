import { eq } from "drizzle-orm";
import sharp from "sharp";
import { extractText, getDocumentProxy } from "unpdf";

import type { Database } from "@/db/client";
import { submissions } from "@/db/schema";
import type { SubmittedFile } from "@/db/schema/learning";
import { withTenant } from "@/db/tenant-scope";
import { fileBytes, loadFile } from "@/server/files";

/*
 * What the review reads from uploaded files (brief §8): text from PDFs and
 * Markdown, images through vision. The text is kept on the submission, so
 * reviewers see what the model saw and evidence quotes can be checked
 * against it.
 */

const FILE_TEXT_LIMIT = 120_000;
/** Enough detail for a rubric review, far fewer tokens than a full-size photo. */
const VISION_SIDE = 1600;

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n\n") : text).trim();
}

async function visionImage(bytes: Uint8Array): Promise<string> {
  const jpeg = await sharp(bytes)
    .resize({ width: VISION_SIDE, height: VISION_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export interface SubmissionFileContent {
  /** Text from PDF and Markdown files, one section per file; null without such files. */
  filesText: string | null;
  /** Data URLs of the submitted images. */
  images: string[];
}

export async function readSubmissionFiles(
  db: Database,
  tenantId: string,
  submission: { id: string; files: SubmittedFile[]; filesText: string | null },
): Promise<SubmissionFileContent> {
  const sections: string[] = [];
  const images: string[] = [];
  for (const submitted of submission.files) {
    const record = await loadFile(db, tenantId, submitted.fileId);
    if (!record) continue;
    if (submitted.kind === "image") {
      images.push(await visionImage(await fileBytes(record)));
      continue;
    }
    if (submission.filesText !== null) continue;
    const bytes = await fileBytes(record);
    const text =
      submitted.kind === "pdf" ? await pdfText(bytes) : new TextDecoder().decode(bytes).trim();
    sections.push(
      `## ${submitted.name}\n\n${text || "(No readable text: the PDF may be a scan or an image.)"}`,
    );
  }

  let filesText = submission.filesText;
  if (filesText === null && sections.length > 0) {
    filesText = sections.join("\n\n").slice(0, FILE_TEXT_LIMIT);
    // Same value on every retry, so writing it again is harmless.
    await withTenant(db, tenantId, (tx) =>
      tx.update(submissions).set({ filesText }).where(eq(submissions.id, submission.id)),
    );
  }
  return { filesText, images };
}

/** Everything the learner wrote or uploaded as text, in the order the review reads it. */
export function reviewText(submission: {
  extractedText: string | null;
  filesText: string | null;
}): string | null {
  const parts = [submission.extractedText, submission.filesText].filter((part): part is string =>
    Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join("\n\n") : null;
}
