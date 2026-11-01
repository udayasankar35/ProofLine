import { aiConfigured, aiProvider, extractClaims, type AiClaim } from "../ai";
import { perDayCap } from "../aicap";
import { audit } from "../audit";
import { FACTS } from "../seed";
import { db, newId, nowIso, todayIso } from "../store";
import type { EvalRun } from "../types";
import { DATASET } from "./dataset";
import { AI_CASES, calibration, computeMetrics, evaluateCase, type CalibRow, type CaseResult, type EvalMetrics } from "./run";

/** Cases per request and pause between requests: keeps one request well inside the time limit and the model's rate limit. */
export const AI_BATCH = 2;
const COOLDOWN_MINUTES = 10; // after a finished AI run
const MAX_RUNS_PER_DAY = 2;
const DAILY_RESERVE = 120; // AI calls always left for people trying the app
const STALE_MINUTES = 20; // a run nobody has touched for this long is treated as abandoned
const ACTOR = { name: "Evaluation suite", role: "admin" };
const EVAL_SESSION = "eval";

export interface AiEvalProgress {
  state: "none" | "running" | "done" | "failed";
  runId: string;
  done: number;
  total: number;
  message: string;
}

export interface AiRunMetrics {
  ai: EvalMetrics;
  /** The keyword matcher alone, scored on exactly the same cases, so the lift from the AI step is visible. */
  rules: EvalMetrics;
  calibration: CalibRow[];
  models: string[];
  errors: number;
  cases: number;
}

const minutesAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;
const progressOf = (r: EvalRun, message = ""): AiEvalProgress => ({ state: r.status, runId: r.id, done: r.done, total: r.total, message });

export async function recentRuns(kind: "rules" | "ai", limit = 6): Promise<EvalRun[]> {
  const store = await db();
  return store.select<EvalRun>("eval_runs", { kind }, { col: "started_at", asc: false }, undefined, limit);
}

export interface FinishedAiRun {
  run: EvalRun;
  metrics: AiRunMetrics;
  failures: ReturnType<typeof failuresOf>;
  /** true when the numbers were recomputed with the current checking code from the AI's saved answers */
  rescored: boolean;
}

/**
 * The latest finished AI run. The AI's answers were saved per draft, so the numbers are recomputed with the checking code
 * that is deployed now (no new AI calls). That keeps this page honest after a code change.
 */
export async function latestFinishedAiRun(): Promise<FinishedAiRun | null> {
  try {
    const runs = await recentRuns("ai", 10);
    const run = runs.find((r) => r.status === "done");
    if (!run) return null;
    const rows = await loadCaseRows(run.id, true);
    if (rows.length) return { run, metrics: buildMetrics(rows), failures: failuresOf(rows.map((x) => x.result)), rescored: true };
    return { run, metrics: JSON.parse(run.metrics) as AiRunMetrics, failures: [], rescored: false };
  } catch {
    return null; // the evaluation page must never break the app
  }
}

export async function activeAiRun(): Promise<EvalRun | null> {
  const runs = await recentRuns("ai", 5);
  return runs.find((r) => r.status === "running" && minutesAgo(r.started_at) < STALE_MINUTES) ?? null;
}

async function callsToday(): Promise<number> {
  const store = await db();
  return store.count("audit_log", { action: "ai_call" }, { col: "created_at", value: `${todayIso()}T00:00:00.000Z` });
}

/** Starts an AI evaluation run, or joins the one already running. Refuses (with a reason) when it would use too much of the AI budget. */
export async function startAiEval(sessionId: string): Promise<{ ok: true; runId: string; resumed: boolean } | { ok: false; message: string }> {
  if (!aiConfigured()) return { ok: false, message: "The AI step is not switched on in this deployment, so there is nothing to measure. The rules-only results above are complete." };
  const store = await db();
  const runs = await recentRuns("ai", 20);

  const active = runs.find((r) => r.status === "running" && minutesAgo(r.started_at) < STALE_MINUTES);
  if (active) return { ok: true, runId: active.id, resumed: true };
  for (const r of runs) if (r.status === "running") await store.update("eval_runs", r.id, { status: "failed", finished_at: nowIso(), details: JSON.stringify({ message: "Abandoned (no activity)." }) });

  const lastDone = runs.find((r) => r.status === "done");
  if (lastDone && minutesAgo(lastDone.finished_at) < COOLDOWN_MINUTES) {
    const wait = Math.ceil(COOLDOWN_MINUTES - minutesAgo(lastDone.finished_at));
    return { ok: false, message: `An AI evaluation just finished. To protect the free AI quota, the next run can start in about ${wait} minute${wait === 1 ? "" : "s"}.` };
  }
  const today = `${todayIso()}T00:00:00.000Z`;
  if (runs.filter((r) => r.started_at >= today).length >= MAX_RUNS_PER_DAY) return { ok: false, message: `AI evaluations are limited to ${MAX_RUNS_PER_DAY} a day to protect the free AI quota. The latest results are shown below.` };

  const total = AI_CASES().length;
  const used = await callsToday();
  if (perDayCap() - used < total + DAILY_RESERVE) return { ok: false, message: "Not enough of today's AI budget is left for a full run (people trying the app come first). Please try again tomorrow." };

  const id = newId("ER-");
  const now = nowIso();
  await store.insert("eval_runs", {
    id,
    kind: "ai",
    model: aiProvider(),
    session_id: sessionId,
    started_at: now,
    finished_at: "",
    status: "running",
    total,
    done: 0,
    metrics: "{}",
    details: "[]",
  });
  await audit(sessionId, ACTOR, "eval_start", `AI evaluation ${id} started on ${total} claim-related cases.`);
  return { ok: true, runId: id, resumed: false };
}

/** What is saved per case: the score, and the AI's raw answer so the case can be re-scored later with newer checking code. */
const slim = (r: CaseResult, claims: AiClaim[] | null) => JSON.stringify({ ...r, text: undefined, claims });

interface CaseRow {
  result: CaseResult;
  model: string;
}

/** Loads the saved cases of a run. With `current`, each case is re-scored from the AI's saved answer using today's checking code. */
async function loadCaseRows(runId: string, current = false): Promise<CaseRow[]> {
  const store = await db();
  const rows = await store.select<EvalRun>("eval_runs", { kind: "ai_case", session_id: runId });
  const byId = new Map(DATASET.map((c) => [c.id, c]));
  const out: CaseRow[] = [];
  for (const row of rows) {
    const id = row.id.split(":")[1];
    const c = byId.get(id);
    if (!c) continue;
    const saved = JSON.parse(row.details) as CaseResult & { claims?: AiClaim[] | null };
    const base: CaseResult = { ...saved, id, set: c.set, text: c.text };
    const result = current && !saved.error && Array.isArray(saved.claims) ? evaluateCase(c, saved.claims) : base;
    out.push({ result, model: row.model });
  }
  return out;
}

function errorResult(id: string, message: string): CaseResult {
  const c = DATASET.find((x) => x.id === id)!;
  return { id, set: c.set, text: c.text, tp: {}, fp: {}, fn: {}, missed: [], extra: [], verdictOk: 0, verdictWrong: 0, verdictMismatch: [], calib: [], factOk: 0, factWrong: 0, error: message };
}

async function failRun(run: EvalRun, message: string): Promise<AiEvalProgress> {
  const store = await db();
  await store.update("eval_runs", run.id, { status: "failed", finished_at: nowIso(), details: JSON.stringify({ message }) });
  return { ...progressOf(run, message), state: "failed" };
}

/** Processes the next few cases of a run. Safe to call again after a failure: finished cases are never repeated. */
export async function aiEvalBatch(runId: string): Promise<AiEvalProgress> {
  const store = await db();
  const run = await store.get<EvalRun>("eval_runs", runId);
  if (!run || run.kind !== "ai") return { state: "none", runId, done: 0, total: 0, message: "That evaluation run was not found." };
  if (run.status !== "running") {
    let message = "";
    try {
      message = (JSON.parse(run.details) as { message?: string }).message ?? "";
    } catch {}
    return progressOf(run, message);
  }
  const existing = (await loadCaseRows(runId)).map((x) => x.result);
  const finished = new Set(existing.map((r) => r.id));
  const pending = AI_CASES().filter((c) => !finished.has(c.id));

  const slice = pending.slice(0, AI_BATCH);
  if (slice.length) {
    const used = await callsToday();
    if (used + slice.length > perDayCap()) return failRun(run, "The daily AI limit was reached, so the run stopped. The cases already finished are kept.");
    const results = await Promise.all(
      slice.map(async (c) => {
        await audit(EVAL_SESSION, ACTOR, "ai_call", `Evaluation ${runId} case ${c.id}`);
        let lastError = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { claims, model } = await extractClaims(c.text, FACTS);
            return { r: evaluateCase(c, claims), model, claims };
          } catch (e) {
            lastError = e instanceof Error ? e.message : "unknown error";
            await new Promise((res) => setTimeout(res, 2500));
          }
        }
        return { r: errorResult(c.id, lastError), model: "", claims: null };
      }),
    );
    const now = nowIso();
    await store.insertIgnore(
      "eval_runs",
      results.map(({ r, model, claims }) => ({ id: `${runId}:${r.id}`, kind: "ai_case", model, session_id: runId, started_at: now, finished_at: now, status: "done", total: 1, done: 1, metrics: "{}", details: slim(r, claims) })),
      "id",
    );
    const all = [...existing, ...results.map((x) => x.r)];
    const errors = all.filter((r) => r.error).length;
    await store.update("eval_runs", runId, { done: new Set(all.map((r) => r.id)).size });
    if (errors >= 8 && errors / all.length > 0.3) return failRun({ ...run, done: all.length }, "The AI service returned too many errors (most likely its rate limit), so the run stopped. Try again in a few minutes.");
  }

  const doneNow = (await loadCaseRows(runId)).map((x) => x.result);
  if (doneNow.length >= run.total || pending.length <= slice.length) return finalize(run, await loadCaseRows(runId, true));
  return { state: "running", runId, done: doneNow.length, total: run.total, message: "" };
}

/** The numbers for a set of scored cases: the AI step, the keyword matcher on the same cases, and the confidence labels. */
export function buildMetrics(rows: CaseRow[]): AiRunMetrics {
  const R4 = ["R-4", "R-4:supported"] as const;
  const results = rows.map((x) => x.result);
  const ok = results.filter((r) => !r.error);
  return {
    ai: computeMetrics(results, R4),
    rules: computeMetrics(
      ok.map((r) => evaluateCase(DATASET.find((c) => c.id === r.id)!, null)),
      R4,
    ),
    calibration: calibration(results).filter((c) => c.origin === "ai"),
    models: [...new Set(rows.map((x) => x.model).filter(Boolean))],
    errors: results.length - ok.length,
    cases: results.length,
  };
}

async function finalize(run: EvalRun, rows: CaseRow[]): Promise<AiEvalProgress> {
  const store = await db();
  const metrics = buildMetrics(rows);
  const results = rows.map((x) => x.result);
  await store.update("eval_runs", run.id, { status: "done", done: results.length, finished_at: nowIso(), metrics: JSON.stringify(metrics), details: JSON.stringify({ failures: failuresOf(results) }) });
  await audit(EVAL_SESSION, ACTOR, "eval_done", `AI evaluation ${run.id} finished: ${results.length} cases, ${metrics.errors} errors.`);
  return { state: "done", runId: run.id, done: results.length, total: run.total, message: "" };
}

/** A compact list of what the AI step got wrong, for the page and the public JSON. */
export function failuresOf(results: CaseResult[]) {
  return results
    .filter((r) => !r.error && (r.missed.some((m) => m.cls.startsWith("R-4")) || r.extra.some((p) => p.cls.startsWith("R-4")) || r.verdictMismatch.length))
    .map((r) => ({
      id: r.id,
      text: r.text,
      missed: r.missed.filter((m) => m.cls.startsWith("R-4")).map((m) => `${m.cls} “${m.quote}”${m.verdict ? ` (${m.verdict})` : ""}`),
      extra: r.extra.filter((p) => p.cls.startsWith("R-4")).map((p) => `${p.cls} “${p.quote}” (${p.verdict}, ${p.confidence})`),
      verdict: r.verdictMismatch.map((v) => `“${v.quote}” expected ${v.expected}, got ${v.got}`),
    }));
}
