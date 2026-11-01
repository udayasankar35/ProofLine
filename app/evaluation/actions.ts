"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import baseline from "@/lib/eval/baseline.json";
import { compareToBaseline, runRulesEval, type EvalMetrics } from "@/lib/eval/run";
import { aiEvalBatch, startAiEval, type AiEvalProgress } from "@/lib/eval/runs";
import { requireUser } from "@/lib/session";
import { db, newId, nowIso } from "@/lib/store";

/** One-click regression run: scores every labelled draft with the current rules and compares with the stored baseline. */
export async function runRegression() {
  const { user, sessionId } = await requireUser();
  const started = nowIso();
  const { results, metrics } = runRulesEval();
  const regressions = compareToBaseline(metrics, baseline as unknown as EvalMetrics);
  const store = await db();
  await store.insert("eval_runs", {
    id: newId("ER-"),
    kind: "rules",
    model: "rules-only",
    session_id: sessionId,
    started_at: started,
    finished_at: nowIso(),
    status: "done",
    total: metrics.cases,
    done: metrics.cases,
    metrics: JSON.stringify(metrics),
    details: JSON.stringify({ regressions, wrong: results.filter((r) => r.missed.length || r.extra.length || r.verdictMismatch.length).length }),
  });
  await audit(sessionId, user, "eval_regression", regressions.length ? `Regression run: ${regressions.length} check(s) worse than baseline.` : `Regression run: ${metrics.cases} drafts, nothing worse than baseline.`);
  revalidatePath("/evaluation");
  const msg = regressions.length
    ? `Regression run finished: ${regressions.length} measure${regressions.length === 1 ? " is" : "s are"} worse than the baseline. See the table below.`
    : `Regression run finished: ${metrics.cases} drafts scored and nothing is worse than the baseline.`;
  redirect(`/evaluation?${regressions.length ? "error" : "notice"}=${encodeURIComponent(msg)}`);
}

export async function startAiEvalAction(): Promise<{ ok: boolean; runId?: string; resumed?: boolean; message?: string }> {
  const { sessionId } = await requireUser();
  const r = await startAiEval(sessionId);
  return r.ok ? { ok: true, runId: r.runId, resumed: r.resumed } : { ok: false, message: r.message };
}

export async function aiEvalBatchAction(runId: string): Promise<AiEvalProgress> {
  await requireUser();
  try {
    return await aiEvalBatch(String(runId));
  } catch (e) {
    console.error("ai eval batch failed", e);
    return { state: "running", runId, done: -1, total: -1, message: "A batch failed; retrying." };
  }
}
