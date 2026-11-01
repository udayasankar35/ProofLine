/** Reads the text layer of a PDF (no AI). Scanned PDFs have no text layer and return an empty string. */
export async function extractPdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/password/i.test(msg)) throw new Error("This PDF is password-protected. Remove the password and upload it again.");
    throw new Error("This PDF could not be opened. It may be damaged. Try exporting it again.");
  }
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = (Array.isArray(text) ? text.join("\n") : text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/([a-z,;])\n(?=[a-z])/g, "$1 ") // a line that stops mid-sentence continues on the next line
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: merged, pages: totalPages };
}
