"use client";

import { useRef, useState } from "react";
import { createDraft, createDraftFromFile, createDraftFromSample } from "@/app/actions";
import { SAMPLES } from "@/lib/seed";
import SubmitButton from "./SubmitButton";
import { btnPrimary, btnSecondary, inputCls } from "./ui";

const CHANNELS = ["Instagram", "Website", "Press note", "Email", "Other"];
const MAX_BYTES = 4 * 1024 * 1024;
const SAMPLE_FILES = [
  { id: "tile", label: "Social tile (image)" },
  { id: "release", label: "Press release (Word)" },
  { id: "flyer", label: "Flyer (PDF)" },
];

/** Shrinks a large photo in the browser so it fits the upload limit and is quicker to read. */
async function shrinkImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function NewDraftForm({ initialMode = "text" }: { initialMode?: "text" | "file" }) {
  const [mode, setMode] = useState<"text" | "file">(initialMode);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("Instagram");
  const [body, setBody] = useState("");
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; image: boolean } | null>(null);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError("");
    let f = e.target.files?.[0];
    if (!f) return setFileInfo(null);
    const isImage = /^image\/(png|jpe?g|webp)$/.test(f.type);
    if (isImage && f.size > 1_200_000) {
      const small = await shrinkImage(f);
      if (small !== f) {
        const dt = new DataTransfer();
        dt.items.add(small);
        if (fileRef.current) fileRef.current.files = dt.files;
        f = small;
      }
    }
    if (f.size === 0) setFileError("That file is empty. Choose a file with some content.");
    else if (f.size > MAX_BYTES) setFileError(`That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 4 MB. Compress it or paste the text instead.`);
    setFileInfo({ name: f.name, size: f.size, image: /^image\//.test(f.type) });
  }

  const tab = (m: "text" | "file", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-teal ${mode === m ? "bg-navy text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  const titleChannel = (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
          Title <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} />
      </div>
      <div>
        <label htmlFor="channel" className="mb-1 block text-sm font-medium text-slate-700">
          Channel
        </label>
        <select id="channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
          {CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="How do you want to add content?">
        {tab("text", "Paste text")}
        {tab("file", "Upload a file or image")}
      </div>

      {mode === "text" ? (
        <form action={createDraft} className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Start from a sample text (optional)</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={btnSecondary}
                  onClick={() => {
                    setTitle(s.title);
                    setChannel(s.channel);
                    setBody(s.body);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {titleChannel}
          <div>
            <label htmlFor="body" className="mb-1 block text-sm font-medium text-slate-700">
              Text to check
            </label>
            <textarea id="body" name="body" required minLength={10} maxLength={4000} rows={9} value={body} onChange={(e) => setBody(e.target.value)} className={inputCls} />
            <p className="mt-1 text-xs text-slate-500">{body.length} / 4000 characters. Paste your own copy, or load a sample above.</p>
          </div>
          <SubmitButton className={btnPrimary} pending="Checking against the guidelines…">
            Check this draft
          </SubmitButton>
        </form>
      ) : (
        <div className="space-y-6">
          <form action={createDraftFromFile} className="space-y-5">
            <div>
              <label htmlFor="file" className="mb-1 block text-sm font-medium text-slate-700">
                File to check
              </label>
              <input
                ref={fileRef}
                id="file"
                name="file"
                type="file"
                required
                accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={onPick}
                className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-tint file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal`}
              />
              <p className="mt-1 text-xs text-slate-500">Word (.docx), PDF, or an image (PNG, JPEG, WebP), up to 4 MB. Large photos are shrunk in your browser first.</p>
              {fileInfo ? (
                <p className="mt-1 text-xs text-slate-700">
                  Selected: <strong>{fileInfo.name}</strong> ({(fileInfo.size / 1024).toFixed(0)} KB)
                </p>
              ) : null}
              {fileError ? (
                <p role="alert" className="mt-1 text-sm text-red-700">
                  {fileError}
                </p>
              ) : null}
            </div>
            {titleChannel}
            {fileInfo?.image ? (
              <div>
                <label htmlFor="alt" className="mb-1 block text-sm font-medium text-slate-700">
                  Alt text for this image <span className="font-normal text-slate-500">(required before review)</span>
                </label>
                <input id="alt" name="alt" maxLength={300} placeholder="One plain sentence that says what the image shows" className={inputCls} />
                <p className="mt-1 text-xs text-slate-500">Leave it empty to get a suggestion after the image is read. You can write it on the next page.</p>
              </div>
            ) : null}
            <SubmitButton className={btnPrimary} disabled={Boolean(fileError) || !fileInfo} pending="Reading your file… this can take up to a minute">
              Read and check this file
            </SubmitButton>
          </form>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">No file handy? Try a fictional sample</p>
            <p className="mb-3 text-xs text-slate-600">Each sample has planted problems so you can see what ProofLine finds.</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_FILES.map((s) => (
                <form key={s.id} action={createDraftFromSample}>
                  <input type="hidden" name="sample_id" value={s.id} />
                  <SubmitButton className={btnSecondary} pending="Reading the sample…">
                    {s.label}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
