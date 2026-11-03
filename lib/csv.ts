import type { Fact } from "./types";

export const MAX_CSV_BYTES = 100 * 1024;
export const MAX_CSV_ROWS = 200;

/** Parses CSV text: quoted values, doubled quotes, commas and line breaks inside quotes, CRLF and a leading BOM. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((x) => x.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === "") inQuotes = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (inQuotes) throw new Error("A quoted value is never closed. Check for a stray double quote.");
  endRow();
  return rows;
}

const COLUMN: Record<string, "statement" | "source" | "owner" | "expires_on" | "keywords"> = {
  statement: "statement",
  fact: "statement",
  source: "source",
  "source document": "source",
  owner: "owner",
  expires_on: "expires_on",
  valid_until: "expires_on",
  "valid until": "expires_on",
  expires: "expires_on",
  keywords: "keywords",
};

export interface ImportRow {
  statement: string;
  source: string;
  owner: string;
  expires_on: string;
  keywords: string;
}
export type ImportParse = { ok: true; rows: ImportRow[]; problems: string[]; total: number } | { ok: false; error: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const realDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Reads a CSV of approved facts. The first row names the columns: statement, source and expires_on are required;
 * owner and keywords are optional. Bad rows are skipped with a reason; a bad file is refused with one.
 * Facts already in the knowledge base (same statement) and repeats inside the file are skipped.
 */
export function parseFactsCsv(text: string, existing: Pick<Fact, "statement">[]): ImportParse {
  if (text.includes("\u0000")) return { ok: false, error: "That does not look like a text file. Save the sheet as CSV (comma separated) and try again." };
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  let table: string[][];
  try {
    table = parseCsv(text, delimiter);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (table.length === 0) return { ok: false, error: "The file is empty. The first row must name the columns: statement, source, expires_on." };
  const header = table[0].map((h) => COLUMN[norm(h)] ?? null);
  const missing = (["statement", "source", "expires_on"] as const).filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, error: `The first row must name the columns. Missing: ${missing.join(", ")}. Optional: owner, keywords.` };
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, error: "The file has a header row but no facts under it." };
  if (body.length > MAX_CSV_ROWS) return { ok: false, error: `The file has ${body.length} rows. The limit is ${MAX_CSV_ROWS}. Split it into smaller files.` };

  const seen = new Set(existing.map((f) => norm(f.statement)));
  const rows: ImportRow[] = [];
  const problems: string[] = [];
  body.forEach((cells, i) => {
    const line = i + 2; // spreadsheet row number, counting the header as row 1
    const get = (col: string) => (cells[header.indexOf(col as never)] ?? "").trim();
    const r: ImportRow = { statement: get("statement"), source: get("source"), owner: get("owner") || "Brand team", expires_on: get("expires_on"), keywords: get("keywords") };
    if (!r.statement || !r.source) return void problems.push(`Row ${line}: needs a statement and a source.`);
    if (r.statement.length > 300) return void problems.push(`Row ${line}: the statement is longer than 300 characters.`);
    if (r.source.length > 200) return void problems.push(`Row ${line}: the source is longer than 200 characters.`);
    if (!realDate(r.expires_on)) return void problems.push(`Row ${line}: expires_on must be a real date written YYYY-MM-DD (for example 2027-03-31).`);
    const key = norm(r.statement);
    if (seen.has(key)) return void problems.push(`Row ${line}: already in the approved facts, skipped.`);
    seen.add(key);
    rows.push({ ...r, owner: r.owner.slice(0, 100), keywords: r.keywords.slice(0, 200) });
  });
  return { ok: true, rows, problems, total: body.length };
}
