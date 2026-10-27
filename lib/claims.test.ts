import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaims } from "./ai";
import { verifyClaims } from "./claims";
import { FACTS, GUIDELINES, SAMPLES } from "./seed";

const TODAY = "2026-10-27";
const text = SAMPLES.find((s) => s.id === "risky")!.body;
const run = (claims: Parameters<typeof verifyClaims>[0]["claims"], takenQuotes: string[] = []) =>
  verifyClaims({ text, claims, facts: FACTS, guidelines: GUIDELINES, today: TODAY, takenQuotes });

test("a quote that is not in the draft is discarded", () => {
  const r = run([{ quote: "The world's best drink", kind: "ranking", fact_id: null, relation: "none" }]);
  assert.equal(r.findings.length, 0);
  assert.equal(r.rejected, 1);
});

test("AI says supported by an EXPIRED fact -> outdated, never supported", () => {
  const r = run([{ quote: "#1 sports drink in India", kind: "ranking", fact_id: "F-07", relation: "supports" }]);
  assert.equal(r.findings[0].verdict, "outdated");
  assert.equal(r.findings[0].severity, "high");
  assert.equal(r.findings[0].origin, "ai");
});

test("a made-up fact ID is ignored and the claim becomes unsupported", () => {
  const r = run([{ quote: "100% natural ingredients", kind: "other", fact_id: "F-99", relation: "supports" }]);
  assert.equal(r.findings[0].verdict, "unsupported");
  assert.equal(r.findings[0].source_ref, "G-2");
});

test("a current matching fact is supported", () => {
  const body = "Sold in more than 2,000 stores across 14 Indian states.";
  const r = verifyClaims({
    text: body,
    claims: [{ quote: "more than 2,000 stores", kind: "number", fact_id: "F-04", relation: "supports" }],
    facts: FACTS,
    guidelines: GUIDELINES,
    today: TODAY,
    takenQuotes: [],
  });
  assert.equal(r.findings[0].verdict, "supported");
  assert.equal(r.findings[0].source_ref, "F-04");
});

test("contradicting a fact is unsupported and names the fact", () => {
  const body = "Sold in more than 3,000 stores.";
  const r = verifyClaims({
    text: body,
    claims: [{ quote: "more than 3,000 stores", kind: "number", fact_id: "F-04", relation: "contradicts" }],
    facts: FACTS,
    guidelines: GUIDELINES,
    today: TODAY,
    takenQuotes: [],
  });
  assert.equal(r.findings[0].verdict, "unsupported");
  assert.match(r.findings[0].reason, /F-04/);
});

test("claims overlapping a rule finding are dropped", () => {
  const r = run([{ quote: "Guaranteed results in 7 days", kind: "time", fact_id: null, relation: "none" }], ["Guaranteed"]);
  assert.equal(r.findings.length, 0);
});

test("parseClaims copes with fenced JSON and drops malformed entries", () => {
  const raw = '```json\n{"claims":[{"quote":"#1","kind":"ranking","fact_id":"f-07","relation":"supports"},{"nope":1},{"quote":"x","relation":"weird"}]}\n```';
  const c = parseClaims(raw);
  assert.equal(c.length, 2);
  assert.equal(c[0].fact_id, "F-07");
  assert.equal(c[1].relation, "none");
  assert.throws(() => parseClaims("not json at all"));
});
