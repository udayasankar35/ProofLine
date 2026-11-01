"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { aiEvalBatchAction, startAiEvalAction } from "./actions";
import { btnPrimary } from "../components/ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AiEvalRunner({ configured, activeRunId, total }: { configured: boolean; activeRunId: string | null; total: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState("");

  async function drive(runId: string) {
    let failures = 0;
    for (;;) {
      const p = await aiEvalBatchAction(runId).catch(() => null);
      if (!p || p.done < 0) {
        failures++;
        if (failures >= 4) {
          setMessage("The connection was interrupted. Press the button again to continue where it stopped: finished cases are not repeated.");
          return;
        }
        await sleep(3000);
        continue;
      }
      failures = 0;
      setProgress({ done: p.done, total: p.total });
      if (p.state !== "running") {
        setMessage(p.state === "failed" ? p.message || "The run stopped." : "");
        return;
      }
      await sleep(1500);
    }
  }

  async function start() {
    setBusy(true);
    setMessage("");
    try {
      const s = await startAiEvalAction();
      if (!s.ok || !s.runId) {
        setMessage(s.message || "The run could not start.");
        return;
      }
      setProgress({ done: 0, total });
      await drive(s.runId);
    } catch {
      setMessage("Something went wrong while starting. Please try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div>
      <button type="button" onClick={start} disabled={busy || !configured} aria-busy={busy} className={btnPrimary}>
        {busy ? "Running…" : activeRunId ? "Continue the AI evaluation" : "Run the AI evaluation"}
      </button>
      {!configured ? <p className="mt-2 text-sm text-slate-600">The AI step is not switched on in this deployment, so there is nothing to run.</p> : null}
      {busy && progress ? (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="h-2 w-full max-w-md overflow-hidden rounded bg-slate-200" aria-hidden>
            <div className="h-full bg-teal transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-sm text-slate-700">
            {progress.done} of {progress.total} drafts checked. Keep this tab open, it takes a few minutes.
          </p>
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      ) : null}
    </div>
  );
}
