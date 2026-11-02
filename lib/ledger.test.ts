import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLedger, evaluateEntry, isBroken } from "./ledger";
import { FACTS } from "./seed";
import type { Finding } from "./types";

const F04 = FACTS.find((f) => f.id === "F-04")!;
const entry = { fact_id: F04.id, fact_statement: F04.statement, fact_source: F04.source };

test("a ledger line is valid while the fact is unchanged and in date", () => {
  assert.equal(evaluateEntry(entry, F04, "2026-11-01").status, "ok");
});

test("expired, changed and removed evidence are each detected", () => {
  assert.equal(evaluateEntry(entry, { ...F04, expires_on: "2026-10-31" }, "2026-11-01").status, "expired");
  assert.equal(evaluateEntry(entry, { ...F04, expires_on: "2026-11-01" }, "2026-11-01").status, "ok"); // valid through its last day
  assert.equal(evaluateEntry(entry, { ...F04, statement: "AquaPulse is sold in more than 5,000 stores." }, "2026-11-01").status, "changed");
  assert.equal(evaluateEntry(entry, { ...F04, source: "A different report" }, "2026-11-01").status, "changed");
  assert.equal(evaluateEntry(entry, undefined, "2026-11-01").status, "removed");
});

test("harmless edits (spacing, capitals, a new expiry date or owner) do not break the ledger", () => {
  assert.equal(evaluateEntry(entry, { ...F04, statement: `  ${F04.statement.toUpperCase()}  ` }, "2026-11-01").status, "ok");
  assert.equal(evaluateEntry(entry, { ...F04, expires_on: "2030-01-01", owner: "Someone else" }, "2026-11-01").status, "ok");
});

test("a reviewer exception has no fact and is never 'broken'", () => {
  const s = evaluateEntry({ fact_id: "", fact_statement: "", fact_source: "" }, undefined, "2026-11-01").status;
  assert.equal(s, "exception");
  assert.equal(isBroken(s), false);
  assert.equal(isBroken("expired") && isBroken("changed") && isBroken("removed"), true);
  assert.equal(isBroken("ok"), false);
});

const finding = (over: Partial<Finding>): Finding => ({
  id: "f-1", draft_id: "D-1", rev: 2, rule_id: "R-4", severity: "low", verdict: "supported", title: "", quote: "more than 2,000 stores", reason: "", source_ref: "F-04", source_text: "",
  fix_kind: "manual", suggestion: "", origin: "ai", confidence: "medium", target: "body", decision: "pending", decision_note: "", decided_by: "", created_at: "2026-11-01T00:00:00Z", ...over,
});

test("approval records supported claims with a snapshot of the fact, and everything else as a reviewer exception", () => {
  const rows = buildLedger({
    draft: { id: "D-1", session_id: "s1", rev: 2 },
    approver: "Elena Shah",
    at: "2026-11-01T10:00:00Z",
    facts: FACTS,
    findings: [
      finding({}),
      finding({ id: "f-2", rule_id: "R-1", verdict: "rule", quote: "insane", source_ref: "G-1", decision: "disputed", decision_note: "Campaign tone", decided_by: "Devon Rao" }),
      finding({ id: "f-3", rule_id: "R-4", verdict: "unsupported", quote: "best taste", source_ref: "G-2" }),
    ],
  });
  assert.equal(rows.length, 3);
  const [a, b, c] = rows;
  assert.equal(a.status, "ok");
  assert.equal(a.fact_id, "F-04");
  assert.equal(a.fact_statement, F04.statement);
  assert.equal(a.approved_by, "Elena Shah");
  assert.equal(a.basis, "AI match, verified by code");
  assert.equal(b.status, "exception");
  assert.match(b.note, /Disputed by Devon Rao: Campaign tone/);
  assert.equal(c.status, "exception");
  assert.equal(c.fact_id, "");
  assert.ok(rows.every((r) => r.draft_id === "D-1" && r.rev === 2 && r.session_id === "s1"));
});

test("a supported claim whose fact no longer exists is not written as evidence", () => {
  const rows = buildLedger({ draft: { id: "D-1", session_id: "s1", rev: 1 }, approver: "E", at: "t", facts: FACTS.filter((f) => f.id !== "F-04"), findings: [finding({})] });
  assert.equal(rows.length, 0);
});

test("keyword matches are labelled as such in the ledger", () => {
  const rows = buildLedger({ draft: { id: "D-1", session_id: "s1", rev: 1 }, approver: "E", at: "t", facts: FACTS, findings: [finding({ origin: "fallback" })] });
  assert.equal(rows[0].basis, "Keyword match (rules-only)");
});
