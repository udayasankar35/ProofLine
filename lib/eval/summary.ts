import type { Finding } from "../types";
import { computeMetrics, runRulesEval } from "./run";
import { latestFinishedAiRun } from "./runs";

let cached: ReturnType<typeof computeMetrics> | null = null;
const rulesMetrics = () => (cached ??= runRulesEval().metrics);

const pct = (x: number | null) => (x === null ? null : `${Math.round(x * 100)}%`);

/**
 * Builds the one-line "how often is this check right" note shown under each finding.
 * It quotes measured numbers from the evaluation suite, never a guess.
 */
export async function measuredFor(): Promise<(f: Finding) => string | undefined> {
  const m = rulesMetrics();
  const ai = await latestFinishedAiRun();
  return (f) => {
    if (f.origin === "vision") return "Image checks are estimates and are not part of the test set. A person should confirm them.";
    if (f.rule_id === "R-6") return "Alt text is checked exactly: it is either present or it is not.";
    const key = f.rule_id === "R-4" ? (f.verdict === "supported" ? "R-4:supported" : "R-4") : f.rule_id;
    if (!(key in m.classes)) return undefined;
    if (f.rule_id === "R-4" && f.origin === "ai") {
      const a = ai?.metrics.ai.classes[key as "R-4" | "R-4:supported"];
      const p = a ? pct(a.precision) : null;
      return p ? `AI claim check: on our test set, ${p} of its ${key === "R-4" ? "problem" : "supported"} findings were right (${ai!.metrics.cases} drafts, measured ${ai!.run.finished_at.slice(0, 10)}).` : "AI claim check: not measured yet. Run it on the Evaluation page.";
    }
    const c = m.classes[key as keyof typeof m.classes];
    const p = pct(c.precision);
    if (!p) return undefined;
    const what = f.rule_id === "R-4" ? "keyword claim matching" : "this rule";
    return `On our ${m.cases}-draft test set, ${what} was right ${p} of the time when it flagged something.`;
  };
}
