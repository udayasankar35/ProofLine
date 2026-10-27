import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFix, runRules, segments } from "./rules";
import { DISCLAIMERS, FACTS, GUIDELINES, SAMPLES, TERMS } from "./seed";

const TODAY = "2026-10-27";
const ctx = (text: string, includeClaims = true) => ({
  text,
  terms: TERMS,
  disclaimers: DISCLAIMERS,
  facts: FACTS,
  guidelines: GUIDELINES,
  today: TODAY,
  includeClaims,
});
const sample = (id: string) => SAMPLES.find((s) => s.id === id)!.body;

test("risky caption: medical wording is a high finding with the F-12 rewrite", () => {
  const f = runRules(ctx(sample("risky")));
  const med = f.find((x) => x.rule_id === "R-3");
  assert.ok(med, "R-3 finding expected");
  assert.equal(med.quote.toLowerCase(), "cures fatigue");
  assert.equal(med.severity, "high");
  assert.match(med.source_ref, /G-4/);
  assert.equal(med.fix_kind, "replace");
  assert.match(med.suggestion, /electrolytes/);
});

test("risky caption: #1 claim is OUTDATED against F-07", () => {
  const f = runRules(ctx(sample("risky")));
  const rank = f.find((x) => x.rule_id === "R-4" && x.quote === "#1");
  assert.ok(rank);
  assert.equal(rank.verdict, "outdated");
  assert.equal(rank.source_ref, "F-07");
});

test("risky caption: guarantees, 100% and missing disclaimer are caught", () => {
  const f = runRules(ctx(sample("risky")));
  assert.ok(f.some((x) => x.rule_id === "R-2" && /guaranteed/i.test(x.quote)));
  assert.ok(f.some((x) => x.rule_id === "R-2" && x.quote.includes("100")));
  const d = f.find((x) => x.rule_id === "R-5");
  assert.ok(d);
  assert.equal(d.fix_kind, "append");
  assert.match(d.source_ref, /D-1/);
});

test("risky caption: banned term INSANE is flagged once, not twice", () => {
  const f = runRules(ctx(sample("risky")));
  const insane = f.filter((x) => /insane/i.test(x.quote));
  assert.equal(insane.length, 1);
  assert.equal(insane[0].rule_id, "R-1");
});

test("clean blurb: no high findings and the store count is SUPPORTED", () => {
  const f = runRules(ctx(sample("clean")));
  assert.equal(f.filter((x) => x.severity === "high").length, 0);
  const stores = f.find((x) => /2,000/.test(x.quote));
  assert.ok(stores);
  assert.equal(stores.verdict, "supported");
  assert.equal(stores.source_ref, "F-04");
});

test("press note: 50,000 bottles is OUTDATED (F-14), recycled PET is supported (F-05)", () => {
  const f = runRules(ctx(sample("outdated")));
  const weekly = f.find((x) => /50,000/.test(x.quote));
  assert.ok(weekly);
  assert.equal(weekly.verdict, "outdated");
  const pet = f.find((x) => x.quote === "40%");
  assert.ok(pet);
  assert.equal(pet.verdict, "supported");
  assert.ok(f.some((x) => x.rule_id === "R-1" && x.quote === "Aqua Pulse"));
  assert.ok(f.some((x) => x.rule_id === "R-1" && x.quote.toLowerCase() === "cheap"));
});

test("includeClaims=false skips the keyword claim matcher (AI path)", () => {
  const f = runRules(ctx(sample("risky"), false));
  assert.equal(f.filter((x) => x.rule_id === "R-4").length, 0);
  assert.ok(f.some((x) => x.rule_id === "R-3"));
});

test("an expired fact never supports a claim", () => {
  const f = runRules(ctx("AquaPulse is the #1 sports drink."));
  const rank = f.find((x) => x.rule_id === "R-4");
  assert.equal(rank?.verdict, "outdated");
});

test("claims with no matching fact are UNSUPPORTED", () => {
  const f = runRules(ctx("AquaPulse is clinically proven to help."));
  const proof = f.find((x) => x.rule_id === "R-4");
  assert.equal(proof?.verdict, "unsupported");
});

test("applyFix: replace, remove, append and manual", () => {
  const body = "AquaPulse cures fatigue! Guaranteed results.";
  const replaced = applyFix(body, {
    fix_kind: "replace",
    quote: "cures fatigue",
    suggestion: "helps replace electrolytes lost through sweat",
  });
  assert.equal(replaced, "AquaPulse helps replace electrolytes lost through sweat! Guaranteed results.");
  const removed = applyFix(body, { fix_kind: "remove", quote: "Guaranteed", suggestion: "" });
  assert.equal(removed, "AquaPulse cures fatigue! results.");
  const appended = applyFix("Hello.", { fix_kind: "append", quote: "x", suggestion: "Disclaimer." });
  assert.equal(appended, "Hello.\n\nDisclaimer.");
  assert.equal(applyFix(appended, { fix_kind: "append", quote: "x", suggestion: "Disclaimer." }), appended);
  assert.equal(applyFix(body, { fix_kind: "manual", quote: "x", suggestion: "" }), body);
});

test("segments highlights findings without overlap", () => {
  const body = "AquaPulse cures fatigue and is Guaranteed.";
  const segs = segments(body, [
    { id: "a", quote: "cures fatigue" },
    { id: "b", quote: "Guaranteed" },
  ]);
  assert.equal(segs.map((s) => s.text).join(""), body);
  assert.deepEqual(
    segs.filter((s) => s.findingId).map((s) => s.findingId),
    ["a", "b"],
  );
});
