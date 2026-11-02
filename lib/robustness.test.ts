import assert from "node:assert/strict";
import { test } from "node:test";
import { textStage } from "./pipeline";
import { runRules } from "./rules";
import { DISCLAIMERS, FACTS, GUIDELINES, TERMS } from "./seed";
import type { Term } from "./types";

const base = (text: string, terms: Term[] = TERMS) => ({ text, terms, disclaimers: DISCLAIMERS, facts: FACTS, guidelines: GUIDELINES, today: "2026-11-01" });
const run = (text: string, terms?: Term[]) => runRules({ ...base(text, terms), includeClaims: true });
const term = (t: string, over: Partial<Term> = {}): Term => ({ id: "T-x", term: t, kind: "banned", replacement: "", reason: "test", guideline_ref: "G-1", ...over });

test("odd input never throws and never produces an empty quote", () => {
  const inputs = [
    "",
    "   \n\t  ",
    "😀🔥 AquaPulse is the #1 drink 🔥😀",
    "अक्वापल्स भारत में सबसे अच्छा पेय है। #1 स्थान",
    "مشروب AquaPulse رقم 1",
    "AquaPulse​ is​ the​ best​ energy​ drink",
    "a\u0000b\u0001c cures\u0007 fatigue",
    "<script>alert(1)</script> guaranteed results",
    "x".repeat(12000),
    "100% ".repeat(2000),
    "1,1,1,1,".repeat(1500),
    "more than " + "1,000 ".repeat(1500),
    ". ".repeat(6000),
  ];
  for (const t of inputs) {
    const f = run(t);
    assert.ok(Array.isArray(f));
    for (const x of f) assert.ok(x.quote.length > 0, `empty quote for input starting ${JSON.stringify(t.slice(0, 30))}`);
    assert.doesNotThrow(() => textStage(base(t), []));
  }
});

test("long adversarial text is checked quickly (no regular-expression blow-up)", () => {
  const nasty = ["1,".repeat(6000), "over ".repeat(2400), "#".repeat(6000), "energy ".repeat(1700), "a-".repeat(6000), " ".repeat(5000) + "x"];
  const t0 = Date.now();
  for (const t of nasty) run(t);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test("an admin term made only of punctuation or spaces cannot flag everything", () => {
  for (const weird of ["-", "--", "(", "[", ".*", "?", "\\", "   ", "$"]) {
    const f = run("Plain, calm copy. Nothing wrong here - really.", [term(weird)]);
    for (const x of f) assert.ok(x.quote.length > 0, `term ${JSON.stringify(weird)} produced an empty quote`);
    assert.ok(f.length < 10, `term ${JSON.stringify(weird)} produced ${f.length} findings`);
  }
});

test("terms with regular-expression characters are matched literally", () => {
  const f = run("Get the C++ edition (limited) today.", [term("C++"), term("(limited)")]);
  assert.ok(f.some((x) => x.quote === "C++"));
  assert.ok(f.some((x) => x.quote === "(limited)"));
});

test("a disclaimer containing regular-expression characters is still recognised", () => {
  const d = [{ id: "D-x", text: "Results vary (see terms). Not a medicine [really]?", triggers: "recovery" }];
  const ctx = { ...base("Great recovery. Results vary (see terms). Not a medicine [really]?"), disclaimers: d, includeClaims: true };
  assert.equal(runRules(ctx).filter((x) => x.rule_id === "R-5").length, 0, "disclaimer present, so no R-5");
});

test("a text that is only the disclaimer has nothing to flag", () => {
  assert.deepEqual(run(DISCLAIMERS[0].text).map((x) => x.rule_id), []);
});

test("checking the same text twice gives the same findings", () => {
  const t = "AquaPulse cures fatigue! The #1 sports drink, guaranteed results in 7 days.";
  const strip = (f: ReturnType<typeof run>) => f.map((x) => `${x.rule_id}|${x.quote}|${x.verdict}`);
  assert.deepEqual(strip(run(t)), strip(run(t)));
});
