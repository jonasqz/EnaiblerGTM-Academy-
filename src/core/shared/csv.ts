type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 CSV. Learners type some of these values (names), so cells a
 * spreadsheet would run as a formula are defused with a leading apostrophe.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<Cell>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
