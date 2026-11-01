import { audit } from "./audit";
import { loadKnowledge } from "./knowledge";
import { buildLedger } from "./ledger";
import { runRules, type RawFinding } from "./rules";
import { db, newId, todayIso } from "./store";
import type { Draft, DraftStatus, Finding, FindingEvent, LedgerEntry } from "./types";

interface Spec {
  title: string;
  channel: string;
  v1: string;
  v2?: string; // the revised text that went to review
  daysAgo: number;
  toSubmitH: number;
  toDecideH: number;
  outcome: DraftStatus;
  disputes?: Array<{ rule: string; quote: string; reason: string }>;
}

const DISC = "AquaPulse is a sports drink, not a medicine. It is not intended to diagnose, treat, cure or prevent any disease. Individual results vary.";

// Fictional history for the AquaPulse demo. Findings come from the real rule engine; the people, timing and decisions are invented.
const SPECS: Spec[] = [
  { title: "Diwali giveaway post", channel: "Instagram", v1: "Win a year of AquaPulse! The #1 sports drink in India, with INSANE flavours. Guaranteed fun!", v2: "Win a year of AquaPulse! Three flavours: lemon-lime, orange and berry. Enter on our website.", daysAgo: 27, toSubmitH: 5, toDecideH: 26, outcome: "approved" },
  { title: "Marathon weekend email", channel: "Email", v1: "AquaPulse cures cramps and helps you recover faster. We sponsor 12 athletes this season!", v2: `AquaPulse replaces electrolytes lost through sweat with sodium, potassium and magnesium. We sponsor 12 national-level athletes in the 2026 season. ${DISC}`, daysAgo: 24, toSubmitH: 20, toDecideH: 4, outcome: "approved" },
  { title: "Free delivery banner", channel: "Website", v1: "Free delivery on orders above Rs 499 on the AquaPulse website. Sold in 3,000 stores nationwide.", v2: "Free delivery on orders above Rs 499 on the AquaPulse website. Sold in more than 2,000 stores across 14 Indian states.", daysAgo: 21, toSubmitH: 3, toDecideH: 2, outcome: "approved" },
  { title: "Eco bottle post", channel: "Instagram", v1: "Our bottles are made with 100% recycled plastic! Cheap and eco.", v2: "Our bottles are made with 40% recycled PET.", daysAgo: 19, toSubmitH: 8, toDecideH: 50, outcome: "approved", disputes: [{ rule: "R-2", quote: "100%", reason: "Our supplier said it is fully recycled" }] },
  { title: "Immunity push", channel: "Instagram", v1: "Boost your immunity with AquaPulse. Clinically proven.", daysAgo: 17, toSubmitH: 30, toDecideH: 6, outcome: "changes_requested", disputes: [{ rule: "R-4", quote: "Clinically proven", reason: "The test report is in the shared drive" }] },
  { title: "Sales milestone press note", channel: "Press note", v1: "AquaPulse now sells over 50,000 bottles every week.", v2: "AquaPulse sold over 50,000 bottles per week in Q1 2026.", daysAgo: 14, toSubmitH: 12, toDecideH: 9, outcome: "approved", disputes: [{ rule: "R-4", quote: "over 50,000 bottles per week", reason: "The period is stated, it is a past figure" }] },
  { title: "Nutrition label page", channel: "Website", v1: "Each 500 ml bottle has 90 calories and no added caffeine.", v2: "Each 500 ml bottle has 90 calories and no added caffeine.", daysAgo: 12, toSubmitH: 1, toDecideH: 1, outcome: "approved" },
  { title: "Taste test newsletter", channel: "Email", v1: "Aqua Pulse wins the taste test! 7 in 10 consumers preferred AquaPulse lemon-lime over a leading rival.", v2: "AquaPulse wins the taste test! In a 2025 internal test of 300 consumers, 7 in 10 preferred AquaPulse lemon-lime over a leading rival.", daysAgo: 9, toSubmitH: 6, toDecideH: 14, outcome: "approved" },
  { title: "FAQ refresh", channel: "Website", v1: "AquaPulse is an energy drink with results in 7 days.", v2: "AquaPulse is a sports drink sweetened with sugar and stevia, with no artificial colours.", daysAgo: 7, toSubmitH: 4, toDecideH: 3, outcome: "approved", disputes: [{ rule: "R-2", quote: "in 7 days", reason: "It describes shipping, not results" }] },
  { title: "Category ranking announcement", channel: "Press note", v1: "AquaPulse is India's best-selling sports drink.", daysAgo: 5, toSubmitH: 22, toDecideH: 7, outcome: "changes_requested", disputes: [{ rule: "R-4", quote: "best-selling", reason: "The renewed ranking report arrives next week" }] },
  { title: "Retailer announcement", channel: "Press note", v1: "AquaPulse is sold in more than 2,000 stores across 14 Indian states.", daysAgo: 1, toSubmitH: 2, toDecideH: 0, outcome: "in_review" },
  { title: "Gym partnership post", channel: "Instagram", v1: "ENERGY drink for your workout, risk-free!", daysAgo: 0, toSubmitH: 0, toDecideH: 0, outcome: "draft" },
];

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Adds fictional past drafts so the insights dashboard and ledger have something to show. Returns how many were added. */
export async function loadSampleHistory(sessionId: string): Promise<number> {
  const store = await db();
  if ((await store.count("drafts", { session_id: sessionId, is_sample: true })) > 0) return 0;
  const k = await loadKnowledge(sessionId);
  const today = todayIso();
  const now = Date.now();
  const ctx = { terms: k.terms, disclaimers: k.disclaimers, facts: k.facts, guidelines: k.guidelines, today, includeClaims: true };
  const sevOrder = { high: 0, medium: 1, low: 2 } as const;
  const run = (text: string) => runRules({ ...ctx, text }).sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  const toEvents = (draftId: string, rev: number, raws: RawFinding[], at: string): FindingEvent[] =>
    raws.map((r) => ({ id: newId("e-"), session_id: sessionId, draft_id: draftId, rev, rule_id: r.rule_id, severity: r.severity, verdict: r.verdict, origin: r.origin, created_at: at }));

  let added = 0;
  for (const s of SPECS) {
    const created = now - s.daysAgo * 24 * HOUR - 6 * HOUR;
    const submitted = created + s.toSubmitH * HOUR;
    const decided = submitted + s.toDecideH * HOUR;
    const body = s.v2 ?? s.v1;
    const rev = s.v2 ? 2 : 1;
    const id = newId("D-s");
    const approved = s.outcome === "approved";
    const draft: Draft = {
      id,
      session_id: sessionId,
      title: s.title,
      channel: s.channel,
      author_id: "u-creator",
      body,
      rev,
      status: s.outcome,
      ai_used: false,
      created_at: iso(created),
      updated_at: iso(s.outcome === "draft" ? created : decided),
      source_type: "text",
      source_name: "",
      alt_text: "",
      extract_note: "",
      visual: "",
      is_sample: true,
      submitted_at: s.outcome === "draft" ? "" : iso(submitted),
      approved_at: approved ? iso(decided) : "",
      approved_by: approved ? "Elena Shah" : "",
    };
    await store.insert("drafts", draft as unknown as Record<string, unknown>);

    const first = run(s.v1);
    const finalRaw = s.v2 ? run(s.v2) : first;
    const revisions = [{ id: newId("r-"), draft_id: id, rev: 1, body: s.v1, note: "First version", actor_name: "Devon Rao", created_at: iso(created) }];
    if (s.v2) revisions.push({ id: newId("r-"), draft_id: id, rev: 2, body: s.v2, note: "Revised after the first check", actor_name: "Devon Rao", created_at: iso(submitted - HOUR) });
    await store.insert("revisions", revisions);

    const events = [...toEvents(id, 1, first, iso(created))];
    if (s.v2) events.push(...toEvents(id, 2, finalRaw, iso(submitted - HOUR)));
    if (events.length) await store.insert("finding_events", events as unknown as Record<string, unknown>[]);

    const disputed = new Set((s.disputes ?? []).map((d) => d.quote.toLowerCase()));
    const findings: Finding[] = finalRaw.map((r) => {
      const d = (s.disputes ?? []).find((x) => r.quote.toLowerCase().includes(x.quote.toLowerCase()) || x.quote.toLowerCase().includes(r.quote.toLowerCase()));
      const isDisputed = Boolean(d) && disputed.size > 0;
      return {
        ...r,
        id: newId("f-"),
        draft_id: id,
        rev,
        confidence: r.confidence ?? (r.origin === "rule" ? "high" : "low"),
        target: r.target ?? "body",
        decision: isDisputed ? "disputed" : r.verdict === "supported" && s.outcome !== "draft" ? "accepted" : "pending",
        decision_note: isDisputed ? d!.reason : r.verdict === "supported" && s.outcome !== "draft" ? "Confirmed against the approved fact" : "",
        decided_by: isDisputed || r.verdict === "supported" ? "Devon Rao" : "",
        created_at: iso(submitted - HOUR),
      };
    });
    if (findings.length) await store.insert("findings", findings as unknown as Record<string, unknown>[]);

    const trail: Array<[number, string, string, string, string]> = [[created, "Devon Rao", "creator", "draft_created", `Created "${s.title}" for ${s.channel}.`]];
    for (const d of s.disputes ?? []) trail.push([created + HOUR, "Devon Rao", "creator", "finding_disputed", `${d.rule} "${d.quote}": ${d.reason}`]);
    if (s.outcome !== "draft") trail.push([submitted, "Devon Rao", "creator", "submitted", `Sent revision ${rev} for review.`]);
    if (approved) trail.push([decided, "Elena Shah", "reviewer", "approved", `Approved revision ${rev}.`]);
    if (s.outcome === "changes_requested") trail.push([decided, "Elena Shah", "reviewer", "changes_requested", "Please resolve the open findings first."]);
    await store.insert(
      "audit_log",
      trail.map(([t, name, role, action, detail]) => ({ id: newId("A-"), session_id: sessionId, draft_id: id, actor_name: name, actor_role: role, action, detail, created_at: iso(t) })),
    );

    if (approved) {
      const rows: LedgerEntry[] = buildLedger({ draft, findings, facts: k.facts, approver: "Elena Shah", at: iso(decided) });
      if (rows.length) await store.insert("ledger_entries", rows as unknown as Record<string, unknown>[]);
    }
    added++;
  }
  await audit(sessionId, { name: "ProofLine", role: "system" }, "sample_history_loaded", `Added ${added} fictional sample drafts with their history.`);
  return added;
}

export async function removeSampleHistory(sessionId: string): Promise<number> {
  const store = await db();
  const drafts = await store.select<Draft>("drafts", { session_id: sessionId, is_sample: true });
  for (const d of drafts) {
    for (const t of ["findings", "revisions", "comments", "draft_files", "ledger_entries", "finding_events", "audit_log"] as const) {
      await store.deleteWhere(t, { draft_id: d.id });
    }
    await store.deleteWhere("drafts", { id: d.id });
  }
  return drafts.length;
}
