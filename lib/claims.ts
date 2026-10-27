import { factLine, guidelineText, isExpired, type RawFinding } from "./rules";
import type { AiClaim } from "./ai";
import type { Fact, Guideline, Severity } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function findRange(text: string, quote: string): [number, number] | null {
  const i = text.toLowerCase().indexOf(quote.toLowerCase());
  return i < 0 ? null : [i, i + quote.length];
}

const KIND_LABEL: Record<string, string> = {
  number: "Numeric",
  ranking: "Ranking",
  proof: "Proof or endorsement",
  comparison: "Comparison",
  time: "Time-bound",
  endorsement: "Endorsement",
  other: "Factual",
};

/**
 * Turns the AI's proposed claims into findings, but only after code checks them.
 * - the quote must be a real substring of the draft (otherwise it is discarded)
 * - the cited fact must exist in the approved list (a made-up fact ID is ignored)
 * - an expired fact can never make a claim "supported"
 * The AI never decides the verdict on its own.
 */
export function verifyClaims(args: {
  text: string;
  claims: AiClaim[];
  facts: Fact[];
  guidelines: Guideline[];
  today: string;
  /** quotes already covered by deterministic rules; overlapping claims are dropped */
  takenQuotes: string[];
}): { findings: RawFinding[]; rejected: number } {
  const { text, claims, facts, guidelines, today } = args;
  const taken = args.takenQuotes
    .map((q) => findRange(text, q))
    .filter((r): r is [number, number] => r !== null);
  const seen = new Set<string>();
  const findings: RawFinding[] = [];
  let rejected = 0;

  for (const c of claims) {
    const range = findRange(text, c.quote);
    if (!range) {
      rejected++; // the AI quoted words that are not in the draft
      continue;
    }
    if (taken.some(([a, b]) => range[0] < b && range[1] > a)) continue;
    const exact = text.slice(range[0], range[1]); // keep the draft's own capitalisation
    const key = norm(exact);
    if (seen.has(key)) continue;
    seen.add(key);

    const fact = c.fact_id ? facts.find((f) => f.id === c.fact_id) : undefined;
    const kind = KIND_LABEL[c.kind] ? c.kind : "other";
    let verdict: "supported" | "unsupported" | "outdated";
    let reason: string;
    if (fact && c.relation === "supports") {
      if (isExpired(fact, today)) {
        verdict = "outdated";
        reason = `Approved fact ${fact.id} covers this, but it expired on ${fact.expires_on}. A claim can't go live on out-of-date evidence. Remove it, or ask the admin for a current, sourced fact.`;
      } else {
        verdict = "supported";
        reason = `Supported by approved fact ${fact.id} (source: ${fact.source}).`;
      }
    } else if (fact && c.relation === "contradicts") {
      verdict = "unsupported";
      reason = `This differs from approved fact ${fact.id}: "${fact.statement}" Use the approved wording or remove the claim.`;
    } else {
      verdict = "unsupported";
      reason = "No approved fact supports this claim. Remove it, or ask the admin to add a sourced fact.";
    }
    const severity: Severity =
      verdict === "supported" ? "low" : kind === "ranking" || kind === "proof" || kind === "endorsement" ? "high" : "medium";
    findings.push({
      rule_id: "R-4",
      severity,
      verdict,
      title: `R-4 · ${KIND_LABEL[kind]} claim`,
      quote: exact,
      reason,
      source_ref: fact ? fact.id : "G-2",
      source_text: fact ? factLine(fact) : guidelineText(guidelines, "G-2"),
      fix_kind: verdict === "supported" ? "manual" : "remove",
      suggestion: "",
      origin: "ai",
    });
  }
  return { findings, rejected };
}
