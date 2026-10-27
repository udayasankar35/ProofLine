"use client";

import { useState } from "react";
import { createDraft } from "@/app/actions";
import { SAMPLES } from "@/lib/seed";
import SubmitButton from "./SubmitButton";
import { btnSecondary, btnPrimary, inputCls } from "./ui";

const CHANNELS = ["Instagram", "Website", "Press note", "Email", "Other"];

export default function NewDraftForm() {
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("Instagram");
  const [body, setBody] = useState("");

  return (
    <form action={createDraft} className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Start from a sample (optional)</p>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
            Title
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

      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium text-slate-700">
          Text to check
        </label>
        <textarea
          id="body"
          name="body"
          required
          minLength={10}
          maxLength={4000}
          rows={9}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-slate-500">{body.length} / 4000 characters. Paste your own copy, or load a sample above.</p>
      </div>

      <SubmitButton className={btnPrimary} pending="Checking against the guidelines…">
        Check this draft
      </SubmitButton>
    </form>
  );
}
