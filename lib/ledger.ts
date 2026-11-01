import { audit } from "./audit";
import { loadKnowledge } from "./knowledge";
import { db, newId, nowIso, todayIso } from "./store";
import type { Draft, Fact, Finding, LedgerEntry, LedgerStatus } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const SYSTEM = { name: "ProofLine", role: "system" };

/** Where a ledger entry stands today, given the current version of the approved fact behind it. Pure and tested. */
export function evaluateEntry(
  e: Pick<LedgerEntry, "fact_id" | "fact_statement" | "fact_source">,
  fact: Fact | undefined,
  today: string,
): { status: LedgerStatus; note: string } {
  if (!e.fact_id) return { status: "exception", note: "" };
  if (!fact) return { status: "removed", note: `${e.fact_id} was removed from the approved facts.` };
  if (fact.expires_on < today) return { status: "expired", note: `${fact.id} expired on ${fact.expires_on}.` };
  if (norm(fact.statement) !== norm(e.fact_statement) || norm(fact.source) !== norm(e.fact_source)) {
    return { status: "changed", note: `${fact.id} was edited after approval. It now says: "${fact.statement}"` };
  }
  return { status: "ok", note: "" };
}

export const isBroken = (s: LedgerStatus) => s === "expired" || s === "changed" || s === "removed";

/** Builds the ledger rows for a piece at the moment it is approved. */
export function buildLedger(args: {
  draft: Pick<Draft, "id" | "session_id" | "rev">;
  findings: Finding[];
  facts: Fact[];
  approver: string;
  at: string;
}): LedgerEntry[] {
  const { draft, findings, facts, approver, at } = args;
  const rows: LedgerEntry[] = [];
  for (const f of findings) {
    const base = {
      id: newId("L-"),
      session_id: draft.session_id,
      draft_id: draft.id,
      rev: draft.rev,
      claim: f.quote,
      kind: f.rule_id,
      approved_by: approver,
      approved_at: at,
      checked_at: at,
    };
    if (f.verdict === "supported" && f.rule_id === "R-4") {
      const fact = facts.find((x) => x.id === f.source_ref);
      if (!fact) continue;
      rows.push({
        ...base,
        basis: f.origin === "ai" ? "AI match, verified by code" : "Keyword match (rules-only)",
        fact_id: fact.id,
        fact_statement: fact.statement,
        fact_source: fact.source,
        fact_owner: fact.owner,
        fact_expires_on: fact.expires_on,
        verdict: "supported",
        note: f.decision === "accepted" ? `Match confirmed by ${f.decided_by}.` : "",
        status: "ok",
        status_note: "",
      });
    } else {
      // Approved even though this finding was not fixed: record who accepted the risk and why.
      rows.push({
        ...base,
        basis: "Reviewer exception",
        fact_id: "",
        fact_statement: "",
        fact_source: "",
        fact_owner: "",
        fact_expires_on: "",
        verdict: f.verdict,
        note: f.decision === "disputed" ? `Disputed by ${f.decided_by}: ${f.decision_note}` : "Approved with this finding still open.",
        status: "exception",
        status_note: "",
      });
    }
  }
  return rows;
}

export async function recordLedger(args: { draft: Draft; findings: Finding[]; facts: Fact[]; approver: string; at: string }) {
  const store = await db();
  await store.deleteWhere("ledger_entries", { draft_id: args.draft.id, rev: args.draft.rev });
  const rows = buildLedger(args);
  if (rows.length) await store.insert("ledger_entries", rows as unknown as Record<string, unknown>[]);
  return rows.length;
}

export interface SweepResult {
  reflagged: Draft[];
  cleared: Draft[];
}

/**
 * Compares every approved piece's ledger with today's approved facts.
 * A piece whose fact expired, changed or was removed becomes "reflagged"; if the cause goes away it returns to "approved".
 * Runs after every fact change and whenever a list or dashboard page loads (there is no background job).
 */
export async function sweepWorkspace(sessionId: string): Promise<SweepResult> {
  const result: SweepResult = { reflagged: [], cleared: [] };
  const store = await db();
  const entries = await store.select<LedgerEntry>("ledger_entries", { session_id: sessionId });
  if (entries.length === 0) return result;
  const drafts = (await store.select<Draft>("drafts", { session_id: sessionId })).filter((d) => d.status === "approved" || d.status === "reflagged");
  if (drafts.length === 0) return result;
  const { facts } = await loadKnowledge(sessionId);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const today = todayIso();
  const now = nowIso();

  for (const d of drafts) {
    const mine = entries.filter((e) => e.draft_id === d.id && e.rev === d.rev);
    let broken = 0;
    for (const e of mine) {
      const r = evaluateEntry(e, byId.get(e.fact_id), today);
      const status = e.status === "exception" && !e.fact_id ? "exception" : r.status;
      const note = r.status === "exception" ? e.status_note : r.note;
      if (status !== e.status || note !== e.status_note) {
        await store.update("ledger_entries", e.id, { status, status_note: note, checked_at: now });
      }
      if (isBroken(status)) broken++;
    }
    if (broken > 0 && d.status === "approved") {
      await store.update("drafts", d.id, { status: "reflagged", updated_at: now });
      await audit(sessionId, SYSTEM, "reflagged", `"${d.title}" needs re-review: ${broken} claim${broken === 1 ? "" : "s"} now rest on evidence that expired, changed or was removed.`, d.id);
      result.reflagged.push(d);
    } else if (broken === 0 && d.status === "reflagged") {
      await store.update("drafts", d.id, { status: "approved", updated_at: now });
      await audit(sessionId, SYSTEM, "reflag_cleared", `"${d.title}" is approved again: its evidence is back in date.`, d.id);
      result.cleared.push(d);
    }
  }
  return result;
}
