import assert from "node:assert/strict";
import { test } from "node:test";
import baseline from "./eval/baseline.json";
import { DATASET } from "./eval/dataset";
import { CLASSES, compareToBaseline, runRulesEval, type EvalMetrics } from "./eval/run";
import { FACTS } from "./seed";

test("dataset: at least 100 drafts, at least 25 clean controls, unique ids", () => {
  assert.ok(DATASET.length >= 100, `only ${DATASET.length} cases`);
  assert.ok(DATASET.filter((c) => c.set === "clean").length >= 25);
  assert.equal(new Set(DATASET.map((c) => c.id)).size, DATASET.length);
});

test("dataset: every expected quote really appears in its text, and clean cases expect no problems", () => {
  for (const c of DATASET) {
    for (const e of c.expect) {
      if (e.r === "R-5") continue;
      assert.ok(e.q && c.text.toLowerCase().includes(e.q.toLowerCase()), `${c.id}: "${e.q}" is not in the text`);
      if (e.r === "R-4") assert.ok(e.v, `${c.id}: R-4 needs a verdict`);
      if (e.v === "supported") assert.ok(e.f && FACTS.some((f) => f.id === e.f), `${c.id}: supported needs a real fact id`);
    }
    if (c.set === "clean") {
      const problems = c.expect.filter((e) => !(e.r === "R-4" && e.v === "supported"));
      assert.equal(problems.length, 0, `${c.id}: a clean control may only contain supported claims`);
    }
  }
});

test("dataset: every rule and every R-4 verdict is covered", () => {
  const seen = new Set(DATASET.flatMap((c) => c.expect.map((e) => (e.r === "R-4" ? `R-4:${e.v}` : e.r))));
  for (const k of ["R-1", "R-2", "R-3", "R-5", "R-4:supported", "R-4:unsupported", "R-4:outdated"]) assert.ok(seen.has(k), `no case for ${k}`);
});

test("regression: no check is worse than the stored baseline", () => {
  const { metrics } = runRulesEval();
  const regressions = compareToBaseline(metrics, baseline as unknown as EvalMetrics);
  assert.deepEqual(regressions, [], `Regressions: ${JSON.stringify(regressions)}`);
});

test("regression: the checks a reviewer relies on stay precise (no false alarms on clean controls)", () => {
  const { metrics } = runRulesEval();
  assert.equal(metrics.cleanControls.withFalseAlarm, 0);
  for (const k of CLASSES) {
    const p = metrics.classes[k].precision;
    assert.ok(p === null || p >= 0.95, `${k} precision ${p}`);
  }
});

test("the evaluation is deterministic", () => {
  const a = JSON.stringify(runRulesEval().metrics);
  const b = JSON.stringify(runRulesEval().metrics);
  assert.equal(a, b);
});
