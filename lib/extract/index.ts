import { aiConfigured, aiProvider, readWithVision } from "../ai";
import type { SourceType, VisualInfo } from "../types";
import { extractDocx } from "./docx";
import { extractPdfText } from "./pdf";

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
export const MAX_DOC_TEXT = 12000;

export interface Sniffed {
  kind: SourceType;
  mime: string;
}

const startsWith = (b: Buffer, ...bytes: number[]) => bytes.every((v, i) => b[i] === v);

/** Works out what a file really is from its first bytes (not just its name). Returns a friendly error otherwise. */
export function sniff(buf: Buffer, name: string): Sniffed | { error: string } {
  if (buf.length === 0) return { error: "That file is empty. Choose a file with some content." };
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (startsWith(buf, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { kind: "pdf", mime: "application/pdf" };
  if (startsWith(buf, 0x89, 0x50, 0x4e, 0x47)) return { kind: "image", mime: "image/png" };
  if (startsWith(buf, 0xff, 0xd8, 0xff)) return { kind: "image", mime: "image/jpeg" };
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (buf.toString("latin1", 0, 4) === "GIF8") return { error: "GIF images are not supported. Export the image as PNG or JPEG." };
  if (buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp" && /hei[cxv]|mif1/.test(buf.toString("latin1", 8, 12))) {
    return { error: "HEIC photos from an iPhone are not supported. Share or export the photo as JPEG, or take a screenshot." };
  }
  if (startsWith(buf, 0x50, 0x4b, 0x03, 0x04)) {
    if (ext === "docx") return { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    return { error: "That looks like a zip-based file that is not a Word (.docx) document. Upload a .docx, .pdf, .png or .jpg file." };
  }
  if (startsWith(buf, 0xd0, 0xcf, 0x11, 0xe0)) {
    return { error: "That is an old-format or password-protected Office file. Save it as .docx without a password and upload it again." };
  }
  if ((ext === "txt" || ext === "md") && !buf.includes(0)) return { kind: "text" as SourceType, mime: "text/plain" };
  return { error: "That file type is not supported. Upload a Word (.docx), PDF, PNG, JPEG or WebP file, or paste the text." };
}

export interface Ingested {
  kind: SourceType;
  mime: string;
  text: string;
  visual: VisualInfo | null;
  note: string;
  suggestedAlt: string;
}

function clip(text: string): { text: string; clipped: boolean } {
  const t = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  return t.length > MAX_DOC_TEXT ? { text: t.slice(0, MAX_DOC_TEXT), clipped: true } : { text: t, clipped: false };
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : "unknown error").slice(0, 200);

/**
 * Reads a file into checkable text.
 * - Word: text and picture alt text come from the file itself (no AI).
 * - PDF: the text layer is read directly; only a scanned PDF (no text layer) is sent to the vision model.
 * - Image: the vision model reads the visible text and estimates colours, text size and contrast.
 * `reserveAi` is called just before an AI request and returns false when a usage limit is reached.
 */
export async function ingestFile(args: {
  buf: Buffer;
  name: string;
  sniffed: Sniffed;
  reserveAi: () => Promise<boolean>;
}): Promise<Ingested> {
  const { buf, sniffed, reserveAi } = args;
  const done = (kind: SourceType, mime: string, raw: string, visual: VisualInfo | null, note: string, suggestedAlt = ""): Ingested => {
    const c = clip(raw);
    return { kind, mime, text: c.text, visual, suggestedAlt, note: c.clipped ? `${note} Only the first ${MAX_DOC_TEXT.toLocaleString("en-IN")} characters were checked.` : note };
  };

  if (sniffed.kind === "docx") {
    const d = await extractDocx(buf);
    const missing = d.images.filter((i) => !i.alt && !i.decorative).length;
    const note =
      `Read ${d.paragraphs} paragraph${d.paragraphs === 1 ? "" : "s"} from the Word file${d.hasHeaderFooter ? " (including header and footer text)" : ""}. ` +
      (d.images.length ? `Found ${d.images.length} picture${d.images.length === 1 ? "" : "s"}, ${missing} without alt text.` : "No pictures found.") +
      " Text boxes, comments and tracked-change history are not checked.";
    return done("docx", sniffed.mime, d.text, { kind: "docx", ai: false, docx_images: d.images }, note);
  }

  if (sniffed.kind === "pdf") {
    const layer = await extractPdfText(buf).catch((e) => {
      if (/password/i.test(reasonOf(e))) throw e;
      return { text: "", pages: 0, failed: reasonOf(e) };
    });
    if (layer.text.replace(/\s/g, "").length >= 30) {
      return done(
        "pdf",
        sniffed.mime,
        layer.text,
        { kind: "pdf", ai: false },
        `Read the text layer of the PDF (${layer.pages} page${layer.pages === 1 ? "" : "s"}) directly, without AI. Visual checks (contrast, size, palette) apply to images; alt text inside a PDF cannot be verified automatically.`,
      );
    }
    // No text layer: this is probably a scanned PDF, so ask the vision model to read it.
    if (!aiConfigured() || aiProvider() !== "gemini") {
      throw new Error("This PDF has no selectable text (it looks scanned) and the AI reader is not available. Paste the text instead.");
    }
    if (!(await reserveAi())) throw new Error("This PDF has no selectable text (it looks scanned) and this demo's AI usage limit is reached. Paste the text instead.");
    try {
      const v = await readWithVision(buf, sniffed.mime);
      if (!v.text) throw new Error("no text was found in it");
      return done(
        "pdf",
        sniffed.mime,
        v.text,
        { kind: "pdf", ai: true, model: v.model, text_blocks: v.text_blocks, colors: v.colors },
        `The PDF has no text layer, so the text was read from the page images by an AI model (${v.model}). AI reading can make mistakes: check the text below against the original.`,
      );
    } catch (e) {
      throw new Error(`This PDF has no selectable text and the AI reader could not read it (${reasonOf(e)}). Paste the text instead, or try again in a minute.`);
    }
  }

  if (sniffed.kind === "image") {
    const off = (why: string) =>
      done("image", sniffed.mime, "", { kind: "image", ai: false }, `${why} Type any text shown in the image into the text box and re-check. The alt text check still runs.`);
    if (!aiConfigured() || aiProvider() !== "gemini") return off("The AI image reader is not available in this deployment, so no text or colours were read.");
    if (!(await reserveAi())) return off("This demo's AI usage limit is reached, so no text or colours were read.");
    try {
      const v = await readWithVision(buf, sniffed.mime);
      return done(
        "image",
        sniffed.mime,
        v.text,
        { kind: "image", ai: true, model: v.model, text_blocks: v.text_blocks, colors: v.colors, suggested_alt: v.suggested_alt },
        v.text
          ? `Text in the image was read by an AI model (${v.model}). AI reading can make mistakes, so check it against the picture.`
          : `The AI model (${v.model}) found no readable text in the image. The alt text and visual checks still ran.`,
        v.suggested_alt,
      );
    } catch (e) {
      return off(`The AI reader could not read this image (${reasonOf(e)}). Use "Read the file again" to retry.`);
    }
  }

  // plain text
  const t = buf.toString("utf8");
  if (t.includes("�")) throw new Error("That text file is not valid UTF-8. Save it as UTF-8 or paste the text.");
  return done("text", "text/plain", t, null, "Read the text file.");
}
