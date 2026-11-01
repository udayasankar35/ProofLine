import type { AiClaim } from "../ai";
import { textStage } from "../pipeline";
import type { RawFinding } from "../rules";
import { DISCLAIMERS, FACTS, GUIDELINES, TERMS } from "../seed";
import { DATASET, EVAL_TODAY, type EvalCase, type EvalSet, type Expected } from "./dataset";

/** The classes that are scored: each fixed rule, R-4 problems (unsupported or outdated), and R-4 claims that are correctly supported. */
export const CLASSES = ["R-1", "R-2", "R-3", "R-4", "R-4:supported", "R-5"] as const;
export type EvalClass = (typeof CLASSES)[number];
export const CLASS_LABEL: Record<EvalClass, string> = {
  "R-1": "R-1 Terms and tone",
  "R-2": "R-2 Absolutes and guarantees",
  "R-3": "R-3 Medical or cure wording",
  "R-4": "R-4 Unsupported or outdated claims",
  "R-4:supported": "R-4 Claims correctly matched to a fact",
  "R-5": "R-5 Required disclaimer",
};

export interface Pred {
  cls: EvalClass;
  quote: string;
  verdict: string;
  fact: string;
  origin: string;
}
export interface Exp {
  cls: EvalClass;
  quote: string;
  verdict?: string;
  fact?: string;
}

export const classOfExpected = (e: Expected): EvalClass => (e.r === "R-4" && e.v === "supported" ? "R-4:supported" : e.r);

export function toPred(f: RawFinding): Pred | null {
  if (!["R-1", "R-2", "R-3", "R-4", "R-5"].includes(f.rule_id)) return null;
  const cls: EvalClass = f.rule_id === "R-4" && f.verdict === "supported" ? "R-4:supported" : (f.rule_id as EvalClass);
  return { cls, quote: f.quote, verdict: f.verdict, fact: f.rule_id === "R-4" ? f.source_ref : "", origin: f.origin };
}

const lc = (s: string) => s.toLowerCase();
const overlaps = (a: string, b: string) => lc(a).includes(lc(b)) || lc(b).includes(lc(a));

export interface CaseResult {
  id: string;
  set: EvalSet;
  text: string;
  tp: Partial<Record<EvalClass, number>>;
  fp: Partial<Record<EvalClass, number>>;
  fn: Partial<Record<EvalClass, number>>;
  missed: Exp[];
  extra: Pred[];
  verdictOk: number; // R-4 problems detected with the right verdict
  verdictWrong: number;
  factOk: number; // supported claims matched to the right fact
  factWrong: number;
  error?: string;
}

/**
 * Compares what the pipeline predicted with what a reviewer expected, for one case.
 * One-to-one matching on (class, overlapping quote). R-5 is matched per text. Extra predictions that overlap an
 * already matched expectation are the same finding reported twice and are ignored, not counted as false alarms.
 */
export function scoreCase(c: EvalCase, preds: Pred[]): CaseResult {
  const r: CaseResult = { id: c.id, set: c.set, text: c.text, tp: {}, fp: {}, fn: {}, missed: [], extra: [], verdictOk: 0, verdictWrong: 0, factOk: 0, factWrong: 0 };
  const bump = (m: Partial<Record<EvalClass, number>>, k: EvalClass) => (m[k] = (m[k] ?? 0) + 1);
  const exps: Exp[] = c.expect.map((e) => ({ cls: classOfExpected(e), quote: e.q ?? "", verdict: e.v, fact: e.f }));
  const used = new Set<number>();
  const matchedExp = new Set<number>();

  for (const e of exps.keys()) {
    const exp = exps[e];
    const i = preds.findIndex((p, idx) => !used.has(idx) && p.cls === exp.cls && (exp.cls === "R-5" || overlaps(p.quote, exp.quote)));
    if (i < 0) {
      bump(r.fn, exp.cls);
      r.missed.push(exp);
      continue;
    }
    used.add(i);
    matchedExp.add(e);
    bump(r.tp, exp.cls);
    if (exp.cls === "R-4") {
      if (preds[i].verdict === exp.verdict) r.verdictOk++;
      else r.verdictWrong++;
    }
    if (exp.cls === "R-4:supported" && exp.fact) {
      if (preds[i].fact === exp.fact) r.factOk++;
      else r.factWrong++;
    }
  }
  preds.forEach((p, idx) => {
    if (used.has(idx)) return;
    // the same finding reported twice (overlaps something already matched): ignore
    const dup = exps.some((e, ei) => matchedExp.has(ei) && e.cls === p.cls && (p.cls === "R-5" || overlaps(p.quote, e.quote)));
    if (dup) return;
    bump(r.fp, p.cls);
    r.extra.push(p);
  });
  return r;
}

export interface ClassMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}
export interface EvalMetrics {
  asOf: string;
  cases: number;
  sets: Record<EvalSet, number>;
  classes: Record<EvalClass, ClassMetrics>;
  /** micro-average over every class except "supported" (these are the problems a reviewer must act on) */
  issues: ClassMetrics;
  bySet: Record<"core" | "hard", ClassMetrics>;
  cleanControls: { total: number; withFalseAlarm: number };
  r4: { verdictOk: number; verdictWrong: number; factOk: number; factWrong: number };
  errors: number;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
function metric(tp: number, fp: number, fn: number): ClassMetrics {
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  return { tp, fp, fn, precision, recall, f1 };
}

export function computeMetrics(results: CaseResult[], only?: readonly EvalClass[]): EvalMetrics {
  const classes = Object.fromEntries(CLASSES.map((k) => [k, { tp: 0, fp: 0, fn: 0 }])) as Record<EvalClass, { tp: number; fp: number; fn: number }>;
  const sets: Record<EvalSet, number> = { core: 0, hard: 0, clean: 0 };
  const bySet = { core: { tp: 0, fp: 0, fn: 0 }, hard: { tp: 0, fp: 0, fn: 0 } };
  const r4 = { verdictOk: 0, verdictWrong: 0, factOk: 0, factWrong: 0 };
  let cleanTotal = 0;
  let cleanBad = 0;
  let errors = 0;
  const inScope = (k: EvalClass) => !only || only.includes(k);
  for (const r of results) {
    if (r.error) {
      errors++;
      continue;
    }
    sets[r.set]++;
    let bad = false;
    for (const k of CLASSES) {
      if (!inScope(k)) continue;
      const tp = r.tp[k] ?? 0;
      const fp = r.fp[k] ?? 0;
      const fn = r.fn[k] ?? 0;
      classes[k].tp += tp;
      classes[k].fp += fp;
      classes[k].fn += fn;
      if (k !== "R-4:supported") {
        if (r.set !== "clean") {
          bySet[r.set].tp += tp;
          bySet[r.set].fp += fp;
          bySet[r.set].fn += fn;
        }
        if (fp > 0) bad = true;
      }
    }
    if (r.set === "clean") {
      cleanTotal++;
      if (bad) cleanBad++;
    }
    r4.verdictOk += r.verdictOk;
    r4.verdictWrong += r.verdictWrong;
    r4.factOk += r.factOk;
    r4.factWrong += r.factWrong;
  }
  const issueKeys = CLASSES.filter((k) => k !== "R-4:supported" && inScope(k));
  const sum = (key: "tp" | "fp" | "fn") => issueKeys.reduce((a, k) => a + classes[k][key], 0);
  return {
    asOf: EVAL_TODAY,
    cases: results.length,
    sets,
    classes: Object.fromEntries(CLASSES.map((k) => [k, metric(classes[k].tp, classes[k].fp, classes[k].fn)])) as Record<EvalClass, ClassMetrics>,
    issues: metric(sum("tp"), sum("fp"), sum("fn")),
    bySet: { core: metric(bySet.core.tp, bySet.core.fp, bySet.core.fn), hard: metric(bySet.hard.tp, bySet.hard.fp, bySet.hard.fn) },
    cleanControls: { total: cleanTotal, withFalseAlarm: cleanBad },
    r4,
    errors,
  };
}

const base = () => ({ terms: TERMS, disclaimers: DISCLAIMERS, facts: FACTS, guidelines: GUIDELINES, today: EVAL_TODAY });

/** Runs one case through the real text stage. `claims` null = rules-only; otherwise the AI's proposed claims. */
export function evaluateCase(c: EvalCase, claims: AiClaim[] | null): CaseResult {
  const { findings } = textStage({ ...base(), text: c.text }, claims);
  const preds = findings.map(toPred).filter((p): p is Pred => p !== null);
  return scoreCase(c, preds);
}

/** The whole set in rules-only mode: instant and deterministic. */
export function runRulesEval(cases: EvalCase[] = DATASET): { results: CaseResult[]; metrics: EvalMetrics } {
  const results = cases.map((c) => evaluateCase(c, null));
  return { results, metrics: computeMetrics(results) };
}

/** Cases where an AI claim step could change the outcome: anything that contains a claim, a ranking or a comparison. */
export function isClaimCase(c: EvalCase): boolean {
  return c.expect.some((e) => e.r === "R-4") || /\d|number one|best|leading|nation|nothing beats|rival|better|favourite|top[- ]rated|proven|award|doctor|expert|scientific|preferred/i.test(c.text);
}

export const AI_CASES = (): EvalCase[] => DATASET.filter(isClaimCase);
export { DATASET, EVAL_TODAY };
