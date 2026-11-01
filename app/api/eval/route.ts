import { NextResponse } from "next/server";
import baseline from "@/lib/eval/baseline.json";
import { FIRST_RUN } from "@/lib/eval/first-run";
import { compareToBaseline, runRulesEval, type EvalMetrics } from "@/lib/eval/run";
import { latestFinishedAiRun } from "@/lib/eval/runs";

export const dynamic = "force-dynamic";

/** Public, read-only summary of the evaluation (aggregate numbers only, no drafts or personal data). */
export async function GET() {
  const { metrics } = runRulesEval();
  const regressions = compareToBaseline(metrics, baseline as unknown as EvalMetrics);
  const ai = await latestFinishedAiRun();
  return NextResponse.json(
    {
      note: "ProofLine evaluation summary. Rules-only numbers are recomputed live on every request.",
      rules: { metrics, regressionsAgainstBaseline: regressions },
      firstRunBeforeFixes: FIRST_RUN,
      ai: ai ? { finishedAt: ai.run.finished_at, rescoredWithCurrentCode: ai.rescored, ...ai.metrics, failures: ai.failures } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
