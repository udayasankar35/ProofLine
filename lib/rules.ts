import type {
  Disclaimer,
  Fact,
  Finding,
  FixKind,
  Guideline,
  Severity,
  Term,
} from "./types";

/** A finding before it is stored (no id, no draft, no decision yet). */
export type RawFinding = Omit<
  Finding,
  "id" | "draft_id" | "rev" | "decision" | "decision_note" | "decided_by" | "created_at"
>;

export interface RuleContext {
  text: string;
  terms: Term[];
  disclaimers: Disclaimer[];
  facts: Fact[];
  guidelines: Guideline[];
  today: string; // YYYY-MM-DD
  /** When false, the keyword-based claim matcher (R-4) is skipped because the AI claim check ran instead. */
  includeClaims: boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isExpired = (f: Fact, today: string) => f.expires_on < today;

export function guidelineText(gs: Guideline[], id: string): string {
  const g = gs.find((x) => x.id === id);
  return g ? `${g.title}: ${g.text}` : "";
}

export function factLine(f: Fact): string {
  return `${f.statement} (Source: ${f.source}. Owner: ${f.owner}. Valid until ${f.expires_on}.)`;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

class Ranges {
  private r: Array<[number, number]> = [];
  overlaps(s: number, e: number) {
    return this.r.some(([a, b]) => s < b && e > a);
  }
  add(s: number, e: number) {
    this.r.push([s, e]);
  }
}

function matchCase(quote: string, replacement: string): string {
  if (!replacement) return replacement;
  return /^[A-Z]/.test(quote) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

function sentenceAt(text: string, index: number): string {
  const before = text.slice(0, index);
  const start = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
    before.lastIndexOf("\n"),
  );
  const rel = text.slice(index).search(/[.!?\n]/);
  const end = rel === -1 ? text.length : index + rel + 1;
  return text.slice(start === -1 ? 0 : start + 1, end).trim();
}

/** The clause around a position: the sentence, cut at commas, semicolons, "and" and "but". */
function clauseAt(text: string, index: number): string {
  const sentence = sentenceAt(text, index);
  const start = text.indexOf(sentence);
  const pos = start >= 0 ? index - start : 0;
  const cut = /(?<!\d),|,(?!\d)|;|\band\b|\bbut\b/gi;
  let from = 0;
  let to = sentence.length;
  for (const m of sentence.matchAll(cut)) {
    const at = m.index ?? 0;
    if (at < pos) from = at + m[0].length;
    else {
      to = at;
      break;
    }
  }
  const clause = sentence.slice(from, to).trim();
  return clause || sentence;
}

/** True when the claim contains a number that the fact does not contain (so it cannot be the same figure). */
function numbersDiffer(claim: string, factStatement: string): boolean {
  const nums = (t: string) => (t.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/g, "").replace(/,/g, ""));
  const have = new Set(nums(factStatement));
  const want = nums(claim);
  return want.length > 0 && want.some((n) => !have.has(n));
}

/** Splits "a,b,50,000" into ["a","b","50,000"]: commas inside numbers are kept. */
export function splitKeywords(raw: string): string[] {
  return raw
    .split(/(?<!\d),|,(?!\d)/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export function matchFact(sentence: string, facts: Fact[]): Fact | null {
  const s = sentence.toLowerCase();
  let best: { fact: Fact; score: number } | null = null;
  for (const fact of facts) {
    const keys = splitKeywords(fact.keywords);
    // keywords match from the start of a word, so "hydrat" finds "hydration" but "pet" does not find "competitors"
    const score = keys.filter((k) => new RegExp(`(?<![\\w])${esc(k)}`).test(s)).length;
    if (score > 0 && (!best || score > best.score)) best = { fact, score };
  }
  return best ? best.fact : null;
}

// --- R-2: absolute or guaranteed wording (G-3) --------------------------------
const ABSOLUTES: Array<{ re: RegExp; fix: FixKind; why: string }> = [
  { re: /\bguarantee[sd]?\b/gi, fix: "remove", why: "A guarantee promises an outcome that can't be backed by evidence." },
  { re: /\b(?:in|within)\s+\d+\s+(?:days?|hours?|weeks?)\b/gi, fix: "remove", why: "A fixed time limit for results is a promise that needs evidence." },
  { re: /\b100\s?%/g, fix: "manual", why: "\"100%\" is an absolute. Use a specific, sourced figure instead." },
  { re: /\b(?:instantly|instant|overnight)\b/gi, fix: "remove", why: "\"Instant\" or \"overnight\" results can't be backed by evidence." },
  { re: /\b(?:always|never fails?|risk[- ]free|zero side effects|no side effects)\b/gi, fix: "remove", why: "Absolute wording like this overpromises." },
];

// --- R-4: claims that need an approved fact (G-2 / G-6) -----------------------
const CLAIM_PATTERNS: Array<{ kind: string; label: string; re: RegExp; severity: Severity; guideline: string; factFilter?: RegExp }> = [
  {
    kind: "ranking",
    label: "Ranking",
    re: /(?:#\s?1(?!\d)|\bno\.?\s?1\b|\bnumber[- ]one\b|\bbest[- ]selling\b|\bworld'?s best\b|\bbest in (?:the )?(?:world|india|class)\b|\bindia'?s (?:best|favou?rite|leading)\b|\bleading brand\b|\btop[- ]rated\b)/gi,
    severity: "high",
    guideline: "G-6",
    // only a ranking fact can support a ranking claim
    factFilter: /\brank|#1|number one|best-selling|leading|top-rated|category/i,
  },
  {
    kind: "proof",
    label: "Proof or endorsement",
    re: /\b(?:clinically|scientifically|dermatologically)\s+(?:proven|tested|approved)\b|\bdoctor[- ]recommended\b|\baward[- ]winning\b|\bproven\b/gi,
    severity: "high",
    guideline: "G-2",
    // only a test, certificate, award or endorsement fact can support a proof claim
    factFilter: /\btested|trial|study|certif|award|recommended|approved|proven/i,
  },
  {
    kind: "number",
    label: "Numeric",
    re: /\b\d[\d,.]*\s?%|\b\d+\s+(?:in|out of)\s+\d+\b|\b(?:more than|over|up to|upto)\s+\d[\d,]*\+?(?:\s+\w+)?|\b\d[\d,]*\+?\s+(?:million|lakh|crore|thousand)?\s*(?:customers|users|people|athletes|stores|bottles|reviews)\b/gi,
    severity: "medium",
    guideline: "G-2",
  },
  {
    kind: "comparison",
    label: "Comparison",
    re: /\b(?:better|faster|stronger|healthier|tastier|cheaper)\s+than\b|\boutperforms?\b|\bover (?:a |the )?(?:leading |other )?(?:rivals?|competitors?|brands?)\b/gi,
    severity: "medium",
    guideline: "G-6",
    factFilter: /rival|prefer|\bthan\b|compar/i,
  },
];

const CAPS_ALLOWED = new Set(["FSSAI", "AQUAPULSE", "RETAILSCOPE"]);

/** Deterministic checks. Works without any AI. */
export function runRules(ctx: RuleContext): RawFinding[] {
  const out: RawFinding[] = [];
  const used = new Ranges();
  const seen = new Set<string>();
  const text = ctx.text;

  const push = (f: RawFinding, idx: number | null) => {
    const key = `${f.rule_id}|${f.quote.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (idx !== null) used.add(idx, idx + f.quote.length);
    out.push(f);
  };

  // R-1: terminology from the workspace's term list (G-1)
  for (const t of ctx.terms) {
    const re = new RegExp(`(?<![\\w])${esc(t.term)}(?![\\w])`, "gi");
    for (const m of text.matchAll(re)) {
      push(
        {
          rule_id: "R-1",
          severity: t.kind === "banned" ? "medium" : "low",
          verdict: "rule",
          title: t.kind === "banned" ? "R-1 · Banned term" : "R-1 · Preferred wording",
          quote: m[0],
          reason: t.reason,
          source_ref: t.guideline_ref,
          source_text: guidelineText(ctx.guidelines, t.guideline_ref),
          fix_kind: t.replacement ? "replace" : "remove",
          suggestion: matchCase(m[0], t.replacement),
          origin: "rule",
        },
        m.index ?? 0,
      );
    }
  }

  // R-3: medical or cure wording (G-4)
  const electrolytes = ctx.facts.find((f) => f.id === "F-12" && !isExpired(f, ctx.today));
  const medRe = /\b(?:cures?|cured|curing|heals?|healing|treats?|treating|prevents?|preventing|relieves?)\s+[A-Za-z-]+/gi;
  for (const m of text.matchAll(medRe)) {
    push(
      {
        rule_id: "R-3",
        severity: "high",
        verdict: "rule",
        title: "R-3 · Medical or cure wording",
        quote: m[0],
        reason: "AquaPulse is a sports drink, not a medicine. It must never be described as curing, treating or preventing a condition.",
        source_ref: electrolytes ? "G-4 · F-12" : "G-4",
        source_text: electrolytes
          ? `${guidelineText(ctx.guidelines, "G-4")}\nApproved alternative: ${factLine(electrolytes)}`
          : guidelineText(ctx.guidelines, "G-4"),
        fix_kind: electrolytes ? "replace" : "remove",
        suggestion: electrolytes ? "helps replace electrolytes lost through sweat" : "",
        origin: "rule",
      },
      m.index ?? 0,
    );
  }
  const HEALTH_EXTRA = [
    { re: /\b(?:boosts?|strengthens?|improves?|supports?)\s+(?:your\s+)?(?:immunity|immune system)\b/gi, why: "Immunity wording is a health claim. AquaPulse is a sports drink and can't claim to affect immunity." },
    { re: /\b(?:lose|burn|shed)\s+\d+\s*(?:kg|kgs|kilos?|pounds|lbs)\b|\bweight[- ]loss\b/gi, why: "Weight-loss wording is a health claim that AquaPulse can't support." },
  ];
  for (const h of HEALTH_EXTRA) {
    for (const m of text.matchAll(h.re)) {
      push(
        {
          rule_id: "R-3",
          severity: "high",
          verdict: "rule",
          title: "R-3 · Medical or cure wording",
          quote: m[0],
          reason: h.why,
          source_ref: "G-4",
          source_text: guidelineText(ctx.guidelines, "G-4"),
          fix_kind: "remove",
          suggestion: "",
          origin: "rule",
        },
        m.index ?? 0,
      );
    }
  }
  for (const m of text.matchAll(/\b(?:miracle|detox\w*)\b/gi)) {
    push(
      {
        rule_id: "R-3",
        severity: "high",
        verdict: "rule",
        title: "R-3 · Medical or cure wording",
        quote: m[0],
        reason: "Miracle or detox wording implies a health effect the product can't claim.",
        source_ref: "G-4",
        source_text: guidelineText(ctx.guidelines, "G-4"),
        fix_kind: "remove",
        suggestion: "",
        origin: "rule",
      },
      m.index ?? 0,
    );
  }

  // R-2: absolutes and guarantees (G-3)
  for (const a of ABSOLUTES) {
    for (const m of text.matchAll(a.re)) {
      const idx = m.index ?? 0;
      if (used.overlaps(idx, idx + m[0].length)) continue;
      push(
        {
          rule_id: "R-2",
          severity: "medium",
          verdict: "rule",
          title: "R-2 · Absolute or guaranteed claim",
          quote: m[0],
          reason: a.why,
          source_ref: "G-3",
          source_text: guidelineText(ctx.guidelines, "G-3"),
          fix_kind: a.fix,
          suggestion: "",
          origin: "rule",
        },
        idx,
      );
    }
  }

  // R-5: required disclaimer (G-5)
  for (const d of ctx.disclaimers) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm(text).includes(norm(d.text).slice(0, 40))) continue;
    for (const raw of d.triggers.split(",")) {
      const trig = raw.trim();
      if (!trig) continue;
      const m = text.match(new RegExp(`(?<![\\w])${esc(trig)}(?![\\w])`, "i"));
      if (!m) continue;
      push(
        {
          rule_id: "R-5",
          severity: "medium",
          verdict: "rule",
          title: "R-5 · Required disclaimer missing",
          quote: m[0],
          reason: `This text uses health or performance wording ("${m[0]}"), so disclaimer ${d.id} is required.`,
          source_ref: `${d.id} · G-5`,
          source_text: `${guidelineText(ctx.guidelines, "G-5")}\nRequired text: ${d.text}`,
          fix_kind: "append",
          suggestion: d.text,
          origin: "rule",
        },
        null,
      );
      break;
    }
  }

  // R-1 (tone): all-caps words (G-1)
  let caps = 0;
  for (const m of text.matchAll(/\b[A-Z]{5,}\b/g)) {
    if (caps >= 3) break;
    if (CAPS_ALLOWED.has(m[0])) continue;
    const idx = m.index ?? 0;
    if (used.overlaps(idx, idx + m[0].length)) continue;
    caps++;
    push(
      {
        rule_id: "R-1",
        severity: "low",
        verdict: "tone",
        title: "R-1 · All-caps wording",
        quote: m[0],
        reason: "All-caps words read as shouting. The brand voice is warm, plain and confident.",
        source_ref: "G-1",
        source_text: guidelineText(ctx.guidelines, "G-1"),
        fix_kind: "replace",
        suggestion: m[0][0] + m[0].slice(1).toLowerCase(),
        origin: "rule",
      },
      idx,
    );
  }

  // R-4: claims matched to approved facts by keywords (rules-only fallback)
  if (ctx.includeClaims) {
    for (const p of CLAIM_PATTERNS) {
      for (const m of text.matchAll(p.re)) {
        const idx = m.index ?? 0;
        if (used.overlaps(idx, idx + m[0].length)) continue;
        const pool = p.factFilter ? ctx.facts.filter((f) => p.factFilter!.test(p.kind === "ranking" ? f.keywords : `${f.statement} ${f.keywords}`)) : ctx.facts;
        const fact = matchFact(clauseAt(text, idx), pool);
        const differs = fact ? numbersDiffer(m[0], fact.statement) : false;
        let verdict: "supported" | "unsupported" | "outdated";
        let reason: string;
        if (fact && differs) {
          verdict = "unsupported";
          reason = `This differs from approved fact ${fact.id}: "${fact.statement}" Use the approved figure or remove the claim.`;
        } else if (fact && !isExpired(fact, ctx.today)) {
          verdict = "supported";
          reason = `Matches approved fact ${fact.id} by keywords. Rules-only mode can't verify exact figures, so a reviewer should confirm the wording matches the fact.`;
        } else if (fact) {
          verdict = "outdated";
          reason = `The matching approved fact ${fact.id} expired on ${fact.expires_on}. A claim can't be published on out-of-date evidence. Remove it, or ask the admin to add a current, sourced fact.`;
        } else {
          verdict = "unsupported";
          reason = "No approved fact supports this claim. Remove it, or ask the admin to add a sourced fact.";
        }
        push(
          {
            rule_id: "R-4",
            severity: verdict === "supported" ? "low" : p.severity,
            verdict,
            title: `R-4 · ${p.label} claim`,
            quote: m[0],
            reason,
            source_ref: fact ? fact.id : p.guideline,
            source_text: fact ? factLine(fact) : guidelineText(ctx.guidelines, p.guideline),
            fix_kind: verdict === "supported" ? "manual" : "remove",
            suggestion: "",
            origin: "fallback",
          },
          idx,
        );
      }
    }
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Applies an accepted suggestion to the draft text. Pure and testable. */
export function applyFix(
  body: string,
  f: Pick<Finding, "fix_kind" | "quote" | "suggestion">,
): string {
  if (f.fix_kind === "append") {
    return body.includes(f.suggestion) ? body : `${body.trimEnd()}\n\n${f.suggestion}`;
  }
  if (f.fix_kind === "manual" || !f.quote) return body;
  const re = new RegExp(esc(f.quote), "gi");
  if (f.fix_kind === "replace") return body.replace(re, () => f.suggestion);
  // remove
  return body
    .replace(re, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/^\s+/, "")
    .trim();
}

/** Splits the draft text into plain and highlighted segments for display. */
export function segments(
  body: string,
  findings: Array<Pick<Finding, "quote"> & { id: string }>,
): Array<{ text: string; findingId?: string }> {
  const lower = body.toLowerCase();
  const ranges: Array<{ start: number; end: number; id: string }> = [];
  for (const f of findings) {
    if (!f.quote) continue;
    const i = lower.indexOf(f.quote.toLowerCase());
    if (i >= 0) ranges.push({ start: i, end: i + f.quote.length, id: f.id });
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; findingId?: string }> = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start < pos) continue;
    if (r.start > pos) out.push({ text: body.slice(pos, r.start) });
    out.push({ text: body.slice(r.start, r.end), findingId: r.id });
    pos = r.end;
  }
  if (pos < body.length) out.push({ text: body.slice(pos) });
  return out;
}
