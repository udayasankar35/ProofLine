import { loadKnowledge } from "./knowledge";
import { ruleLabel } from "./rule-labels";
import { db, todayIso } from "./store";
import type { AuditEntry, Draft, FindingEvent, LedgerEntry } from "./types";

export interface Insights {
  drafts: { total: number; sample: number; mine: number; approved: number; inReview: number; reflagged: number };
  topRules: Array<{ rule: string; label: string; raised: number; drafts: number }>;
  disputes: Array<{ rule: string; label: string; disputes: number; drafts: number; rate: number; unclear: boolean }>;
  approval: { count: number; medianH: number | null; meanH: number | null; fastestH: number | null; slowestH: number | null; startToApprovalMedianH: number | null };
  facts: Array<{ id: string; statement: string; expires_on: string; days: number; state: "expired" | "soon" | "ok"; usedBy: number }>;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const hours = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

/** Governance numbers for one session. `mineOnly` leaves out the fictional sample history. */
export async function computeInsights(sessionId: string, mineOnly: boolean): Promise<Insights> {
  const store = await db();
  const [allDrafts, events, audits, ledger, k] = await Promise.all([
    store.select<Draft>("drafts", { session_id: sessionId }),
    store.select<FindingEvent>("finding_events", { session_id: sessionId }),
    store.select<AuditEntry>("audit_log", { session_id: sessionId, action: "finding_disputed" }),
    store.select<LedgerEntry>("ledger_entries", { session_id: sessionId }),
    loadKnowledge(sessionId),
  ]);
  const drafts = mineOnly ? allDrafts.filter((d) => !d.is_sample) : allDrafts;
  const ids = new Set(drafts.map((d) => d.id));
  const ev = events.filter((e) => ids.has(e.draft_id));
  const dis = audits.filter((a) => ids.has(a.draft_id));

  // most-triggered rules: how many times each rule fired, and in how many different drafts
  const fired = new Map<string, { raised: number; drafts: Set<string> }>();
  for (const e of ev) {
    if (e.verdict === "supported") continue; // a supported claim is not a problem
    const f = fired.get(e.rule_id) ?? { raised: 0, drafts: new Set<string>() };
    f.raised++;
    f.drafts.add(e.draft_id);
    fired.set(e.rule_id, f);
  }
  const topRules = [...fired.entries()]
    .map(([rule, f]) => ({ rule, label: ruleLabel(rule), raised: f.raised, drafts: f.drafts.size }))
    .sort((a, b) => b.drafts - a.drafts || b.raised - a.raised);

  // most-disputed: authors disagreeing with a rule is a hint that the guideline is unclear or the rule is too strict
  const disputed = new Map<string, { n: number; drafts: Set<string> }>();
  for (const a of dis) {
    const rule = /^(R-\d+)/.exec(a.detail)?.[1];
    if (!rule) continue;
    const d = disputed.get(rule) ?? { n: 0, drafts: new Set<string>() };
    d.n++;
    d.drafts.add(a.draft_id);
    disputed.set(rule, d);
  }
  const disputes = [...disputed.entries()]
    .map(([rule, d]) => {
      const total = fired.get(rule)?.drafts.size ?? d.drafts.size;
      const rate = total ? d.drafts.size / total : 0;
      return { rule, label: ruleLabel(rule), disputes: d.n, drafts: d.drafts.size, rate, unclear: d.drafts.size >= 2 && rate >= 0.3 };
    })
    .sort((a, b) => b.disputes - a.disputes);

  // time to approval
  const done = drafts.filter((d) => d.approved_at && d.submitted_at);
  const waits = done.map((d) => hours(d.submitted_at, d.approved_at)).filter((h) => h >= 0);
  const full = done.map((d) => hours(d.created_at, d.approved_at)).filter((h) => h >= 0);

  // facts about to expire, and how many approved pieces depend on each
  const live = new Map(drafts.filter((d) => d.status === "approved" || d.status === "reflagged").map((d) => [d.id, d.rev]));
  const today = todayIso();
  const t0 = new Date(today).getTime();
  const facts = k.facts
    .map((f) => {
      const days = Math.round((new Date(f.expires_on).getTime() - t0) / 86_400_000);
      const usedBy = new Set(ledger.filter((e) => e.fact_id === f.id && live.get(e.draft_id) === e.rev).map((e) => e.draft_id)).size;
      return { id: f.id, statement: f.statement, expires_on: f.expires_on, days, state: (days < 0 ? "expired" : days <= 60 ? "soon" : "ok") as "expired" | "soon" | "ok", usedBy };
    })
    .filter((f) => f.state !== "ok")
    .sort((a, b) => a.days - b.days);

  return {
    drafts: {
      total: drafts.length,
      sample: allDrafts.filter((d) => d.is_sample).length,
      mine: allDrafts.filter((d) => !d.is_sample).length,
      approved: drafts.filter((d) => d.status === "approved").length,
      inReview: drafts.filter((d) => d.status === "in_review").length,
      reflagged: drafts.filter((d) => d.status === "reflagged").length,
    },
    topRules,
    disputes,
    approval: {
      count: waits.length,
      medianH: median(waits),
      meanH: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
      fastestH: waits.length ? Math.min(...waits) : null,
      slowestH: waits.length ? Math.max(...waits) : null,
      startToApprovalMedianH: median(full),
    },
    facts,
  };
}

export function fmtHours(h: number | null): string {
  if (h === null) return "n/a";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
