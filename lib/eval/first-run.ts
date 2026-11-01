import type { EvalClass } from "./run";

/**
 * The very first run of the evaluation set (rules-only mode), recorded BEFORE any defect was fixed.
 * Kept so the Evaluation page and the docs can show what the suite found. The raw output is in docs/eval-first-run.txt.
 */
export const FIRST_RUN: {
  note: string;
  classes: Record<EvalClass, { tp: number; fp: number; fn: number }>;
  cleanFalseAlarms: number;
  cleanTotal: number;
  verdict: { ok: number; total: number };
} = {
  note: "First run, before any fixes (Sun 1 Nov 2026).",
  classes: {
    "R-1": { tp: 21, fp: 0, fn: 2 },
    "R-2": { tp: 23, fp: 0, fn: 2 },
    "R-3": { tp: 19, fp: 4, fn: 5 },
    "R-4": { tp: 26, fp: 3, fn: 15 },
    "R-4:supported": { tp: 9, fp: 5, fn: 9 },
    "R-5": { tp: 14, fp: 0, fn: 0 },
  },
  cleanFalseAlarms: 2,
  cleanTotal: 31,
  verdict: { ok: 24, total: 26 },
};

/** What the first run found and what was done about it. Shown on the Evaluation page. */
export const DEFECTS_FOUND: Array<{ what: string; fix: string }> = [
  { what: "The required disclaimer text (“not intended to diagnose, treat, cure or prevent any disease”) was flagged by the medical-wording rule, so a correct post was marked as a violation.", fix: "Text inside a required disclaimer is now ignored by every wording rule, and by the AI claim step." },
  { what: "Plural and hyphenated forms of banned terms (“energy drinks”, “energy-drink”) were missed.", fix: "Terms now match plurals and hyphen or space variants, and suggest the matching plural." },
  { what: "“Better than any rival”, “Cheaper than every rival” and “better than rival brands” were marked as SUPPORTED because the fact about a taste preference mentions a rival.", fix: "A comparison is only supported by a fact that makes the same comparison, in the rules and in the AI step. This was the most serious error: a false “supported”." },
  { what: "“India’s best-selling” was quoted as “India’s best”, so applying the fix would have left “-selling” behind.", fix: "The ranking pattern now quotes the whole phrase." },
  { what: "“Tastier than the leading brand” raised a ranking claim about AquaPulse, but “the leading brand” is a competitor.", fix: "“Leading brand” after than, over, versus or beats is no longer treated as a ranking claim." },
  { what: "One sentence that quoted the 7-in-10 test produced two “supported” findings for the same fact.", fix: "The same fact in the same clause is reported once." },
];
