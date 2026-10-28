import { audit } from "./audit";
import { aiConfigured, aiProvider, extractClaims } from "./ai";
import { verifyClaims } from "./claims";
import { runRules, type RawFinding } from "./rules";
import { db, newId, nowIso, todayIso } from "./store";
import type { Disclaimer, Draft, Fact, Finding, Guideline, Term, User } from "./types";

export interface CheckResult {
  ai: "used" | "off" | "failed" | "capped";
  note: string;
  total: number;
  high: number;
}

const PER_SESSION = () => Number(process.env.AI_SESSION_CAP || 15);
const PER_DAY = () => Number(process.env.AI_DAILY_CAP || 300);

/**
 * Runs the two-stage check on a draft and replaces its stored findings.
 * Stage 1: deterministic rules (always). Stage 2: AI claim extraction, verified by code.
 * If the AI is off, fails or is capped, the keyword matcher runs instead, and findings say so.
 */
export async function runCheck(draft: Draft, actor: Pick<User, "name" | "role">): Promise<CheckResult> {
  const store = await db();
  const [guidelines, facts, terms, disclaimers, previous] = await Promise.all([
    store.select<Guideline>("guidelines"),
    store.select<Fact>("facts"),
    store.select<Term>("terms"),
    store.select<Disclaimer>("disclaimers"),
    store.select<Finding>("findings", { draft_id: draft.id }),
  ]);
  const today = todayIso();
  const base = { text: draft.body, terms, disclaimers, facts, guidelines, today };

  let ai: CheckResult["ai"] = "off";
  let note = "Rules-only check (no AI key configured).";
  let aiFindings: RawFinding[] | null = null;
  let rejected = 0;

  if (aiConfigured()) {
    const startOfDay = `${today}T00:00:00.000Z`;
    const [mine, all] = await Promise.all([
      store.count("audit_log", { action: "ai_call", session_id: draft.session_id }),
      store.count("audit_log", { action: "ai_call" }, { col: "created_at", value: startOfDay }),
    ]);
    if (mine >= PER_SESSION() || all >= PER_DAY()) {
      ai = "capped";
      note = "Rules-only check (AI usage limit reached for this demo).";
    } else {
      await audit(draft.session_id, actor, "ai_call", `Claim extraction for draft ${draft.id}`, draft.id);
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
        aiFindings = v.findings;
        rejected = v.rejected;
        ai = "used";
        note = `AI-assisted check (${aiProvider()}, ${model}). ${claims.length} claim${claims.length === 1 ? "" : "s"} proposed by the AI${rejected ? `, ${rejected} rejected because the quote was not in the draft` : ""}; every verdict was verified by code.`;
      } catch (e) {
        ai = "failed";
        note = `Rules-only check (the AI step failed: ${e instanceof Error ? e.message : "unknown error"}).`;
      }
    }
  }

  const rules = runRules({ ...base, includeClaims: aiFindings === null });
  const sevOrder = { high: 0, medium: 1, low: 2 } as const;
  const raw = [...rules, ...(aiFindings ?? [])].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // Keep a reviewer's earlier disputes when the same finding comes back after a re-check.
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
      decision: prev ? "disputed" : "pending",
      decision_note: prev ? prev.decision_note : "",
      decided_by: prev ? prev.decided_by : "",
      created_at: created,
    };
  });

  await store.deleteWhere("findings", { draft_id: draft.id });
  if (rows.length) await store.insert("findings", rows as unknown as Record<string, unknown>[]);
  await store.update("drafts", draft.id, { ai_used: ai === "used", updated_at: created });

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
