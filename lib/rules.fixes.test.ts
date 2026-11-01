import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyClaims } from "./claims";
import { textStage } from "./pipeline";
import { comparisonCovered, disclaimerRanges, runRules } from "./rules";
import { DISCLAIMERS, FACTS, GUIDELINES, TERMS } from "./seed";

const TODAY = "2026-11-01";
const base = (text: string) => ({ text, terms: TERMS, disclaimers: DISCLAIMERS, facts: FACTS, guidelines: GUIDELINES, today: TODAY });
const run = (text: string) => runRules({ ...base(text), includeClaims: true });
const DISC = DISCLAIMERS[0].text;

// Defects found by the first evaluation run (see docs/EVALUATION.md)

test("the required disclaimer is never flagged by the wording rules", () => {
  const f = run(`Great for recovery. ${DISC}`);
  assert.equal(f.filter((x) => x.rule_id === "R-3").length, 0);
  assert.equal(f.length, 0, JSON.stringify(f.map((x) => x.quote)));
});

test("the disclaimer is found whatever the spacing and capitals", () => {
  const messy = DISC.toUpperCase().replace(/ /g, "  \n");
  assert.equal(disclaimerRanges(`x ${messy} y`, DISCLAIMERS).length, 1);
  assert.equal(run(`Great for recovery. ${messy}`).filter((x) => x.rule_id === "R-3").length, 0);
});

test("wording right next to the disclaimer is still flagged", () => {
  const f = run(`AquaPulse cures fatigue. ${DISC}`);
  assert.ok(f.some((x) => x.rule_id === "R-3" && /cures fatigue/i.test(x.quote)));
});

test("a trimmed disclaimer does not hide anything", () => {
  const f = run("It is not intended to cure or prevent any disease.");
  assert.ok(f.some((x) => x.rule_id === "R-3"));
});

test("banned terms are found in plural and hyphenated form, with a matching suggestion", () => {
  const plural = run("Energy drinks are not what we make.").find((x) => x.rule_id === "R-1");
  assert.ok(plural);
  assert.equal(plural.quote, "Energy drinks");
  assert.equal(plural.suggestion, "Sports drinks");
  assert.ok(run("An energy-drink alternative.").some((x) => x.rule_id === "R-1" && x.quote === "energy-drink"));
  assert.ok(run("Aqua Pulse is back.").some((x) => x.rule_id === "R-1"));
  assert.ok(run("These are insane.").some((x) => x.rule_id === "R-1" && x.quote === "insane"));
});

test("a comparison is not supported by a fact that makes a different comparison", () => {
  for (const t of ["Better than any rival on the market.", "Cheaper than every rival.", "Our 12 athletes say AquaPulse is better than rival brands."]) {
    const c = run(t).find((x) => x.rule_id === "R-4" && /than/i.test(x.quote));
    assert.ok(c, t);
    assert.equal(c.verdict, "unsupported", t);
  }
  assert.equal(comparisonCovered("over a leading rival", FACTS.find((f) => f.id === "F-08")!.statement), true);
  assert.equal(comparisonCovered("better than any rival", FACTS.find((f) => f.id === "F-08")!.statement), false);
});

test("the AI step is held to the same rule: it cannot call a comparison supported", () => {
  const text = "AquaPulse is better than any rival.";
  const { findings } = verifyClaims({
    text,
    claims: [{ quote: "better than any rival", kind: "comparison", fact_id: "F-08", relation: "supports" }],
    facts: FACTS,
    guidelines: GUIDELINES,
    today: TODAY,
    takenQuotes: [],
  });
  assert.equal(findings[0].verdict, "unsupported");
});

test("India's best-selling is quoted whole, so the fix does not leave '-selling' behind", () => {
  const f = run("India's best-selling sports drink, again.").find((x) => x.rule_id === "R-4");
  assert.ok(f);
  assert.equal(f.quote, "India's best-selling");
  assert.equal(f.verdict, "outdated");
});

test("'the leading brand' as a competitor is not a ranking claim about AquaPulse", () => {
  const f = run("Tastier than the leading brand, say fans.");
  assert.ok(!f.some((x) => x.rule_id === "R-4" && x.quote.toLowerCase() === "leading brand"));
  assert.ok(f.some((x) => x.rule_id === "R-4" && /tastier than/i.test(x.quote)));
  // but claiming to BE the leading brand is still caught
  assert.ok(run("AquaPulse is the leading brand.").some((x) => x.rule_id === "R-4" && /leading brand/i.test(x.quote)));
});

test("one fact in one clause is reported once", () => {
  const f = run("7 in 10 consumers preferred AquaPulse lemon-lime over a leading rival.").filter((x) => x.rule_id === "R-4");
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "supported");
});

test("AI claims quoted from inside the disclaimer are dropped", () => {
  const text = `Fuel your performance. ${DISC}`;
  const { findings } = textStage(base(text), [{ quote: "treat, cure or prevent any disease", kind: "other", fact_id: null, relation: "none" }]);
  assert.equal(findings.length, 0);
});
