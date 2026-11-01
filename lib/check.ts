import { audit } from "./audit";
import { aiConfigured, aiProvider, extractClaims } from "./ai";
import { reserveAiCall } from "./aicap";
import { verifyClaims } from "./claims";
import { loadKnowledge } from "./knowledge";
import { runRules, type RawFinding } from "./rules";
import { db, newId, nowIso, todayIso } from "./store";
import type { Confidence, Draft, Finding, FindingEvent, Origin, User } from "./types";
import { parseVisual, visualFindings } from "./visual";

export interface CheckResult {
  ai: "used" | "off" | "failed" | "capped" | "skipped";
  note: string;
  total: number;
  high: number;
}

const DEFAULT_CONFIDENCE: Record<Origin, Confidence> = { rule: "high", ai: "medium", fallback: "low", vision: "low" };

const rangeOf = (text: string, quote: string): [number, number] | null => {
  const i = text.toLowerCase().indexOf(quote.toLowerCase());
  return i < 0 ? null : [i, i + quote.length];
};

/**
 * Runs the check on a draft and replaces its stored findings.
 * Stage 1: deterministic rules on the text (always), plus alt-text and visual rules for uploaded files.
 * Stage 2: AI claim extraction, verified by code. If the AI is off, fails or is capped, the keyword matcher runs instead.
 */
export async function runCheck(draft: Draft, actor: Pick<User, "name" | "role">): Promise<CheckResult> {
  const store = await db();
  const [{ guidelines, facts, terms, disclaimers }, previous] = await Promise.all([
    loadKnowledge(draft.session_id),
    store.select<Finding>("findings", { draft_id: draft.id }),
  ]);
  const today = todayIso();
  const base = { text: draft.body, terms, disclaimers, facts, guidelines, today };
  const hasText = draft.body.trim().length >= 10;

  let ai: CheckResult["ai"] = "off";
  let note = "Rules-only check (no AI key configured).";
  let aiFindings: RawFinding[] | null = null;
  let rejected = 0;

  if (!hasText) {
    ai = "skipped";
    note = "No text to check yet, so only the accessibility checks ran.";
  } else if (aiConfigured()) {
    const allowed = await reserveAiCall(draft.session_id, actor, `Claim extraction for draft ${draft.id}`, draft.id);
    if (!allowed) {
      ai = "capped";
      note = "Rules-only check (AI usage limit reached for this demo).";
    } else {
      try {
        const { claims, model } = await extractClaims(draft.body, facts);
        const pre = runRules({ ...base, includeClaims: false });
        const v = verifyClaims({
          text: draft.body,
          claims,
          facts,
          guidelines,
          today,
          takenQuotes: pre.map((f) => f.quote),
        });
        // Safety net: rankings and proof claims ("#1", "clinically proven") are high risk and have exact patterns,
        // so the keyword matcher still covers them if the AI missed one. Anything the AI already covered wins.
        const aiRanges = v.findings.map((f) => rangeOf(draft.body, f.quote)).filter((r): r is [number, number] => r !== null);
        const safety = runRules({ ...base, includeClaims: true, claimKinds: ["ranking", "proof"] })
          .filter((f) => f.rule_id === "R-4" && f.origin === "fallback")
          .filter((f) => {
            const r = rangeOf(draft.body, f.quote);
            return !r || !aiRanges.some(([a, b]) => r[0] < b && r[1] > a);
          });
        aiFindings = [...v.findings, ...safety];
        rejected = v.rejected;
        ai = "used";
        note = `AI-assisted check (${aiProvider()}, ${model}). ${claims.length} claim${claims.length === 1 ? "" : "s"} proposed by the AI${rejected ? `, ${rejected} rejected because the quote was not in the draft` : ""}; every verdict was verified by code. Ranking and proof wording is also covered by fixed patterns.`;
      } catch (e) {
        ai = "failed";
        note = `Rules-only check (the AI step failed: ${e instanceof Error ? e.message : "unknown error"}).`;
      }
    }
  }

  const textFindings = hasText ? runRules({ ...base, includeClaims: aiFindings === null }) : [];

  // Alt text is public copy too: check it against the wording rules (terms, absolutes, medical wording).
  const altFindings: RawFinding[] = [];
  if (draft.source_type === "image" && draft.alt_text.trim().length >= 8) {
    for (const f of runRules({ ...base, text: draft.alt_text, includeClaims: false })) {
      if (f.rule_id === "R-5" || f.rule_id === "R-4") continue;
      altFindings.push({
        ...f,
        title: `${f.title} (in the alt text)`,
        fix_kind: "manual",
        reason: f.fix_kind === "replace" && f.suggestion ? `${f.reason} Edit the alt text: use “${f.suggestion}”.` : `${f.reason} Edit the alt text.`,
        target: "alt",
      });
    }
  }

  const visual = visualFindings({
    sourceType: draft.source_type,
    alt: draft.alt_text,
    visual: parseVisual(draft.visual),
    guidelines,
  });

  const sevOrder = { high: 0, medium: 1, low: 2 } as const;
  const raw = [...textFindings, ...(aiFindings ?? []), ...altFindings, ...visual].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // Keep a human's earlier disputes when the same finding comes back after a re-check.
  const carried = new Map<string, Finding>();
  for (const p of previous) {
    if (p.decision === "disputed") carried.set(`${p.rule_id}|${p.quote.toLowerCase()}`, p);
  }
  const created = nowIso();
  const rows: Finding[] = raw.map((r) => {
    const prev = carried.get(`${r.rule_id}|${r.quote.toLowerCase()}`);
    return {
      ...r,
      id: newId("f-"),
      draft_id: draft.id,
      rev: draft.rev,
      confidence: r.confidence ?? DEFAULT_CONFIDENCE[r.origin],
      target: r.target ?? "body",
      decision: prev ? "disputed" : "pending",
      decision_note: prev ? prev.decision_note : "",
      decided_by: prev ? prev.decided_by : "",
      created_at: created,
    };
  });

  await store.deleteWhere("findings", { draft_id: draft.id });
  if (rows.length) await store.insert("findings", rows as unknown as Record<string, unknown>[]);
  await store.update("drafts", draft.id, { ai_used: ai === "used", updated_at: created });

  // One event per finding per check run, so the insights page can count what fires over time.
  if (rows.length) {
    const events: FindingEvent[] = rows.map((r) => ({
      id: newId("e-"),
      session_id: draft.session_id,
      draft_id: draft.id,
      rev: draft.rev,
      rule_id: r.rule_id,
      severity: r.severity,
      verdict: r.verdict,
      origin: r.origin,
      created_at: created,
    }));
    try {
      await store.insert("finding_events", events as unknown as Record<string, unknown>[]);
    } catch (e) {
      console.error("finding_events insert failed", e); // insights are secondary: never fail a check because of them
    }
  }

  const high = rows.filter((r) => r.severity === "high").length;
  await audit(
    draft.session_id,
    actor,
    "check_run",
    `Revision ${draft.rev}: ${rows.length} finding${rows.length === 1 ? "" : "s"} (${high} high). ${note}`,
    draft.id,
  );
  return { ai, note, total: rows.length, high };
}
