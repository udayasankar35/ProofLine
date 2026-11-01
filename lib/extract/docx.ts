import JSZip from "jszip";

const MAX_PART_BYTES = 8 * 1024 * 1024; // refuse to inflate any single part of the file beyond this (zip-bomb guard)

export interface DocxResult {
  text: string;
  images: Array<{ name: string; alt: string; decorative: boolean }>;
  paragraphs: number;
  hasHeaderFooter: boolean;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function readPart(zip: JSZip, name: string): Promise<string | null> {
  const entry = zip.file(name);
  if (!entry) return null;
  const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (typeof declared === "number" && declared > MAX_PART_BYTES) throw new Error("This Word file is unusually large inside. Export it again or paste the text instead.");
  const xml = await entry.async("string");
  if (xml.length > MAX_PART_BYTES) throw new Error("This Word file is unusually large inside. Export it again or paste the text instead.");
  return xml;
}

/** Reads the visible text of a WordprocessingML part, one line per paragraph. */
export function linesOf(xml: string): string[] {
  const body = xml.replace(/<mc:Fallback[\s\S]*?<\/mc:Fallback>/g, ""); // text boxes are stored twice; keep one copy
  const lines: string[] = [];
  let cur = "";
  const flush = () => {
    const t = cur.replace(/[ \t]+$/g, "");
    if (t.trim()) lines.push(t);
    cur = "";
  };
  const token = /<w:p[ >/]|<\/w:p>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g;
  for (const m of body.matchAll(token)) {
    if (m[1] !== undefined) cur += decodeXml(m[1]);
    else if (m[0] === "<w:tab/>") cur += "\t";
    else if (m[0].startsWith("<w:br")) cur += "\n";
    else flush();
  }
  flush();
  return lines;
}

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? decodeXml(m[1]).trim() : "";
};

/** Pictures in the document and whether each has alt text (or is marked decorative). */
export function imagesOf(xml: string): DocxResult["images"] {
  const out: DocxResult["images"] = [];
  for (const d of xml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)) {
    if (!d[0].includes("<pic:pic")) continue; // charts, shapes and text boxes are not pictures
    const p = /<wp:docPr\b([^>]*?)\/?>/.exec(d[0]);
    const attrs = p ? p[1] : "";
    const decorative = /decorative[^>]*val="1"/.test(d[0]);
    out.push({ name: attr(attrs, "name") || `Image ${out.length + 1}`, alt: attr(attrs, "descr") || attr(attrs, "title"), decorative });
  }
  return out;
}

export async function extractDocx(buf: Buffer): Promise<DocxResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error("This file could not be opened as a Word document. It may be damaged. Try saving it again as .docx.");
  }
  const main = await readPart(zip, "word/document.xml");
  if (main === null) throw new Error("This does not look like a Word (.docx) document.");

  const lines = linesOf(main);
  const extras: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).sort()) {
    const xml = await readPart(zip, name);
    if (!xml) continue;
    for (const l of linesOf(xml)) if (!lines.includes(l) && !extras.includes(l)) extras.push(l);
  }
  return {
    text: [...lines, ...extras].join("\n"),
    images: imagesOf(main),
    paragraphs: lines.length,
    hasHeaderFooter: extras.length > 0,
  };
}
