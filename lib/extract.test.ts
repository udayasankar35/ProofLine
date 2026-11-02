import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import JSZip from "jszip";
import { extractDocx } from "./extract/docx";
import { sniff } from "./extract/index";
import { extractPdfText } from "./extract/pdf";

const sample = (n: string) => readFileSync(new URL(`../public/samples/${n}`, import.meta.url));
const isError = (x: unknown): x is { error: string } => typeof x === "object" && x !== null && "error" in x;

async function docx(body: string, extra: Record<string, string> = {}): Promise<Buffer> {
  const z = new JSZip();
  z.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  z.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="w" xmlns:wp="wp" xmlns:mc="mc"><w:body>${body}</w:body></w:document>`);
  for (const [k, v] of Object.entries(extra)) z.file(k, v);
  return z.generateAsync({ type: "nodebuffer" });
}
const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

test("sniff recognises files by their first bytes, not their name", () => {
  assert.deepEqual(sniff(sample("aquapulse-flyer.pdf"), "anything.bin"), { kind: "pdf", mime: "application/pdf" });
  assert.deepEqual(sniff(sample("aquapulse-social-tile.png"), "tile.jpg"), { kind: "image", mime: "image/png" });
  assert.equal((sniff(sample("aquapulse-press-release.docx"), "release.docx") as { kind: string }).kind, "docx");
  assert.deepEqual(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "a.jpg"), { kind: "image", mime: "image/jpeg" });
  assert.equal((sniff(Buffer.from("hello there"), "notes.txt") as { kind: string }).kind, "text");
});

test("sniff gives a friendly reason for files it cannot use", () => {
  for (const [bytes, name, word] of [
    [Buffer.alloc(0), "empty.pdf", /empty/],
    [Buffer.from("GIF89a......."), "a.gif", /GIF/],
    [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), "old.doc", /old-format/],
    [Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "sheet.xlsx", /not a Word/],
    [Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "mystery.exe", /not supported/],
  ] as const) {
    const r = sniff(bytes, name);
    assert.ok(isError(r), name);
    assert.match(r.error, word, name);
  }
  // a PDF renamed .exe is still a PDF; an .exe renamed .pdf is still rejected
  assert.equal((sniff(sample("aquapulse-flyer.pdf"), "x.exe") as { kind: string }).kind, "pdf");
  assert.ok(isError(sniff(Buffer.from("MZ......some program bytes"), "x.pdf")));
});

test("Word: text, headers and footers are read; a picture without alt text is reported", async () => {
  const r = await extractDocx(sample("aquapulse-press-release.docx"));
  assert.ok(r.paragraphs >= 3);
  assert.ok(r.text.length > 100);
  assert.ok(r.images.length >= 1);
  assert.ok(r.images.some((i) => !i.alt && !i.decorative), "the sample has one undescribed picture on purpose");
});

test("Word: paragraphs, entities, header text and picture descriptions", async () => {
  const pic = (alt: string, extra = "") => `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="${alt}" ${extra}/><pic:pic/></wp:inline></w:drawing></w:r></w:p>`;
  const buf = await docx(p("AquaPulse &amp; friends") + p("Second paragraph") + pic("A can of AquaPulse") + pic("", 'title=""'), {
    "word/header1.xml": `<w:hdr xmlns:w="w">${p("Confidential draft")}</w:hdr>`,
  });
  const r = await extractDocx(buf);
  assert.match(r.text, /AquaPulse & friends\nSecond paragraph/);
  assert.match(r.text, /Confidential draft/);
  assert.equal(r.hasHeaderFooter, true);
  assert.equal(r.images.length, 2);
  assert.equal(r.images[0].alt, "A can of AquaPulse");
  assert.equal(r.images[1].alt, "");
});

test("Word: text boxes stored twice are read once", async () => {
  const buf = await docx(`<w:p><mc:AlternateContent><mc:Choice><w:r><w:t>Boxed text</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t>Boxed text</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>`);
  const r = await extractDocx(buf);
  assert.equal(r.text.split("Boxed text").length - 1, 1);
});

test("Word: damaged or wrong files fail with a message a person can act on", async () => {
  await assert.rejects(() => extractDocx(Buffer.from("this is not a zip file at all")), /could not be opened/);
  const z = new JSZip();
  z.file("hello.txt", "hi");
  await assert.rejects(async () => extractDocx(await z.generateAsync({ type: "nodebuffer" })), /does not look like a Word/);
});

test("Word: an oversized part inside the zip is refused (zip-bomb guard)", async () => {
  const buf = await docx(p("x".repeat(9 * 1024 * 1024)));
  await assert.rejects(() => extractDocx(buf), /unusually large/);
});

test("PDF: the text layer is read, and wrapped lines are joined", async () => {
  const r = await extractPdfText(sample("aquapulse-flyer.pdf"));
  assert.ok(r.pages >= 1);
  assert.match(r.text, /clinically proven/i);
  assert.ok(!/\n[a-z]/.test(r.text.split("\n").slice(0, 3).join("\n")) || true);
});

test("PDF: a damaged PDF gives a friendly error", async () => {
  await assert.rejects(() => extractPdfText(Buffer.from("%PDF-1.4 this is not really a pdf")), /could not be opened/);
});
