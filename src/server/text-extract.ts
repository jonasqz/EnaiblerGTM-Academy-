import { extractText, getDocumentProxy } from "unpdf";

/** Plain text of a PDF (all pages). Scans without a text layer give "". */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n\n") : text).trim();
}

/** Text of an uploaded PDF, Markdown or text file. */
export async function documentText(bytes: Uint8Array, contentType: string): Promise<string> {
  if (contentType === "application/pdf") return pdfText(bytes);
  return new TextDecoder().decode(bytes).trim();
}
