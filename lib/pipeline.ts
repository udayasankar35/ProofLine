import type { AiClaim } from "./ai";
import { verifyClaims } from "./claims";
import { runRules, type RawFinding, type RuleContext } from "./rules";

const rangeOf = (text: string, quote: string): [number, number] | null => {
  const i = text.toLowerCase().indexOf(quote.toLowerCase());
  return i < 0 ? null : [i, i + quote.length];
};

/**
 * The text stage of a check, shared by the app and by the evaluation suite so both run exactly the same code.
 * - `claims === null`: no AI claims, so the keyword matcher does the claim matching (rules-only mode).
 * - otherwise: fixed rules, plus the AI's claims verified by code, plus a keyword safety net for ranking and proof wording.
 */
export function textStage(base: Omit<RuleContext, "includeClaims" | "claimKinds">, claims: AiClaim[] | null): { findings: RawFinding[]; rejected: number } {
  if (claims === null) return { findings: runRules({ ...base, includeClaims: true }), rejected: 0 };
  const pre = runRules({ ...base, includeClaims: false });
  const v = verifyClaims({ text: base.text, claims, facts: base.facts, guidelines: base.guidelines, today: base.today, takenQuotes: pre.map((f) => f.quote) });
  // Rankings and proof claims ("#1", "clinically proven") are high risk and have exact patterns, so the keyword matcher
  // still covers them if the AI missed one. Anything the AI already covered wins.
  const aiRanges = v.findings.map((f) => rangeOf(base.text, f.quote)).filter((r): r is [number, number] => r !== null);
  const safety = runRules({ ...base, includeClaims: true, claimKinds: ["ranking", "proof"] })
    .filter((f) => f.rule_id === "R-4" && f.origin === "fallback")
    .filter((f) => {
      const r = rangeOf(base.text, f.quote);
      return !r || !aiRanges.some(([a, b]) => r[0] < b && r[1] > a);
    });
  return { findings: [...pre, ...v.findings, ...safety], rejected: v.rejected };
}
