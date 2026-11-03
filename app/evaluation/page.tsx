import baseline from "@/lib/eval/baseline.json";
import { DEFECTS_FOUND, FIRST_RUN } from "@/lib/eval/first-run";
import { AI_CASES, CLASSES, CLASS_LABEL, compareToBaseline, runRulesEval, type ClassMetrics, type EvalMetrics } from "@/lib/eval/run";
import { activeAiRun, latestFinishedAiRun, recentRuns, type FinishedAiRun } from "@/lib/eval/runs";
import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/session";
import type { EvalRun } from "@/lib/types";
import SubmitButton from "../components/SubmitButton";
import { Card, ErrorBanner, NoticeBanner, btnSecondary, fmtDate } from "../components/ui";
import { runRegression } from "./actions";
import AiEvalRunner from "./AiEvalRunner";

export const maxDuration = 60;

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(0)}%`);
const ratio = (tp: number, fp: number, fn: number) => ({ p: tp + fp === 0 ? null : tp / (tp + fp), r: tp + fn === 0 ? null : tp / (tp + fn) });

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{sub}</p>
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2 text-sm text-slate-800";

export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireUser();
  const { notice, error } = await searchParams;
  const { results, metrics: m } = runRulesEval();
  const regressions = compareToBaseline(m, baseline as unknown as EvalMetrics);
  const [rulesRuns, ai, active] = await Promise.all([
    recentRuns("rules", 5).catch(() => [] as EvalRun[]),
    latestFinishedAiRun(),
    activeAiRun().catch(() => null),
  ]);
  const hardExpected = m.bySet.hard.tp + m.bySet.hard.fn;
  const wrong = results.filter((r) => r.missed.length || r.extra.length || r.verdictMismatch.length);
  const aiCases = AI_CASES().length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Evaluation</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">
          How do we know the checks are right? We wrote <strong>{m.cases} short AquaPulse drafts</strong> and labelled, by hand, what a careful reviewer would flag in each.
          This page scores the real checking code against those labels. <strong>Precision</strong> asks: of the things we flagged, how many were right (few false alarms).{" "}
          <strong>Recall</strong> asks: of the real problems, how many did we find (few misses).
        </p>
      </div>
      <NoticeBanner message={notice} />
      <ErrorBanner message={error} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Labelled drafts" value={String(m.cases)} sub={`${m.sets.core} typical · ${m.sets.hard} hard · ${m.sets.clean} clean controls`} />
        <Tile label="Precision, all rules" value={pct(m.issues.precision)} sub={`${m.issues.tp} right, ${m.issues.fp} false alarms`} />
        <Tile label="Recall, all rules" value={pct(m.issues.recall)} sub={`${m.issues.tp} found, ${m.issues.fn} missed`} />
        <Tile label="False alarms on clean drafts" value={`${m.cleanControls.withFalseAlarm} of ${m.cleanControls.total}`} sub="Good copy that must not be flagged" />
      </div>

      <Card title="Fixed rules and keyword matching, check by check">
        <div className="overflow-x-auto" role="region" aria-label="Scrollable table" tabIndex={0}>
          <table className="min-w-full divide-y divide-slate-200">
            <caption className="sr-only">Precision and recall for each check, now and in the first run before fixes</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>Check</th>
                <th scope="col" className={th}>Right</th>
                <th scope="col" className={th}>False alarms</th>
                <th scope="col" className={th}>Missed</th>
                <th scope="col" className={th}>Precision</th>
                <th scope="col" className={th}>Recall</th>
                <th scope="col" className={th}>First run (before fixes)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CLASSES.map((k) => {
                const c = m.classes[k];
                const f = FIRST_RUN.classes[k];
                const fr = ratio(f.tp, f.fp, f.fn);
                return (
                  <tr key={k}>
                    <th scope="row" className={`${td} text-left font-medium`}>{CLASS_LABEL[k]}</th>
                    <td className={td}>{c.tp}</td>
                    <td className={td}>{c.fp}</td>
                    <td className={td}>{c.fn}</td>
                    <td className={`${td} font-semibold`}>{pct(c.precision)}</td>
                    <td className={`${td} font-semibold`}>{pct(c.recall)}</td>
                    <td className={`${td} text-slate-600`}>
                      {pct(fr.p)} precision, {pct(fr.r)} recall
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          <li>
            <strong>Typical violations ({m.sets.core} drafts):</strong> precision {pct(m.bySet.core.precision)}, recall {pct(m.bySet.core.recall)}. We used this set to find and fix defects, so treat these figures as
            optimistic. The first run (right-hand column) is the more honest signal.
          </li>
          <li>
            <strong>Hard drafts ({m.sets.hard}):</strong> paraphrases such as “Nothing beats AquaPulse”, “Cleanse your system” or “launched in 2019”. Rules alone find {m.bySet.hard.tp} of the {hardExpected} expected findings.
            We did <em>not</em> write rules for these on purpose: they are the test of what the AI step adds.
          </li>
          <li>
            <strong>Clean controls ({m.sets.clean}):</strong> good copy, some with true claims and the required disclaimer. {m.cleanControls.withFalseAlarm} were flagged wrongly (first run: {FIRST_RUN.cleanFalseAlarms} of {FIRST_RUN.cleanTotal}).
          </li>
          <li>
            <strong>Claims found and tied to the right fact:</strong> keyword matching only recognises claims with a clear shape (rankings, proof words, figures with units, comparisons), so it
            finds {pct(m.classes["R-4:supported"].recall)} of the true claims. The AI step reads the whole draft and is measured below.
          </li>
          <li>
            <strong>Wrong verdicts:</strong> where the right claim was found, the verdict (unsupported or outdated) was right {m.r4.verdictOk} of {m.r4.verdictOk + m.r4.verdictWrong} times. The two misses are
            “Rated number one by athletes” and “Top-rated by 9 out of 10 athletes”: the keyword matcher links “number one” and “top-rated” to the expired category ranking and calls them outdated, when no fact covers them at all.
          </li>
        </ul>
      </Card>

      <Card title="Regression run">
        <p className="text-sm text-slate-700">
          After any change, press the button. It re-scores all {m.cases} drafts with the current rules and compares every precision and recall figure with the stored baseline. It also runs automatically in the
          test suite before every build, so a change that makes a check worse cannot be deployed unnoticed.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form action={runRegression}>
            <SubmitButton className={btnSecondary} pending="Scoring…">
              Run regression now
            </SubmitButton>
          </form>
          <p className={`text-sm font-medium ${regressions.length ? "text-red-800" : "text-emerald-800"}`}>
            {regressions.length ? `${regressions.length} measure${regressions.length === 1 ? " is" : "s are"} worse than the baseline.` : "Nothing is worse than the baseline."}
          </p>
        </div>
        {regressions.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {regressions.map((r) => (
              <li key={`${r.cls}${r.measure}`}>
                {CLASS_LABEL[r.cls]}: {r.measure} {pct(r.baseline)} to {pct(r.now)}
              </li>
            ))}
          </ul>
        ) : null}
        {rulesRuns.length ? (
          <div className="mt-4 overflow-x-auto" role="region" aria-label="Scrollable table" tabIndex={0}>
            <table className="min-w-full divide-y divide-slate-200">
              <caption className="sr-only">Recent regression runs</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>When</th>
                  <th scope="col" className={th}>Drafts</th>
                  <th scope="col" className={th}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rulesRuns.map((r) => {
                  let n = 0;
                  try {
                    n = (JSON.parse(r.details) as { regressions?: unknown[] }).regressions?.length ?? 0;
                  } catch {}
                  return (
                    <tr key={r.id}>
                      <td className={td}>{fmtDate(r.finished_at || r.started_at)}</td>
                      <td className={td}>{r.total}</td>
                      <td className={td}>{n ? `${n} worse than baseline` : "Nothing worse than baseline"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card title="What the first run found, and what we fixed">
        <p className="text-sm text-slate-700">
          The first time we scored the set, before changing any code, the checks were not perfect. Those results are kept (see <code>docs/eval-first-run.txt</code>). Each defect below was fixed in the checking code,
          with a test, and the figures above are after the fixes.
        </p>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-slate-800">
          {DEFECTS_FOUND.map((d) => (
            <li key={d.what}>
              <p>{d.what}</p>
              <p className="mt-0.5 text-slate-600">
                <span className="font-medium text-slate-800">Fixed:</span> {d.fix}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="The AI claim check">
        <p className="text-sm text-slate-700">
          The AI reads a draft and proposes the claims in it. Code then verifies every one: the quote must be in the draft, the fact must exist, an expired fact can never support a claim, and figures
          must match. This run sends the {aiCases} drafts that contain a claim, a ranking or a comparison to the AI and scores the result against the same labels, next to the keyword matcher on the same drafts.
        </p>
        <div className="mt-3">
          <AiEvalRunner configured={aiConfigured()} activeRunId={active?.id ?? null} total={aiCases} />
          <p className="mt-2 text-xs text-slate-600">Uses about {aiCases} AI requests. Limited to 2 runs a day and 10 minutes apart to protect the free AI quota. Results shift a little from run to run.</p>
        </div>
        {ai ? <AiResults ai={ai} /> : <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">No AI evaluation has been run yet. Press the button to measure it.</p>}
      </Card>

      <Card title="Where the checks still fall short">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-teal">Show the {wrong.length} drafts the fixed rules and keyword matching still get wrong</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {wrong.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-200 p-3">
                <p className="text-slate-900">
                  <span className="font-mono text-xs text-slate-600">{r.id} · {r.set}</span> “{r.text}”
                </p>
                <ul className="mt-1 list-disc pl-5 text-slate-700">
                  {r.missed.map((x, i) => (
                    <li key={`m${i}`}>Missed {x.cls.replace(":supported", " (supported claim)")} “{x.quote}”{x.verdict ? ` (${x.verdict})` : ""}</li>
                  ))}
                  {r.extra.map((x, i) => (
                    <li key={`e${i}`}>False alarm {x.cls} “{x.quote}”</li>
                  ))}
                  {r.verdictMismatch.map((x, i) => (
                    <li key={`v${i}`}>“{x.quote}”: expected {x.expected}, got {x.got}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <Card title="Limits of this evaluation">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>One person wrote both the rules and these {m.cases} drafts. The numbers show consistency with the brand guidelines, not performance on copy we have never seen.</li>
          <li>The set is small and in one made-up brand (AquaPulse). Real campaigns will contain wording we did not think of.</li>
          <li>Image and document checks are not scored here. Uploaded text goes through the same checks as typed text; image findings (contrast, small text, palette) are estimates that a person must confirm.</li>
          <li>The AI step can change between runs and between model versions. Its numbers are a snapshot, shown with the date.</li>
          <li>Dates are fixed to {m.asOf} so the labels do not change when a fact expires.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          The raw numbers are also available as JSON at <a className="text-teal underline" href="/api/eval">/api/eval</a>.
        </p>
      </Card>
    </div>
  );
}

function AiResults({ ai }: { ai: FinishedAiRun }) {
  const { run, metrics, failures } = ai;
  const rows: Array<[string, "R-4" | "R-4:supported"]> = [
    ["Claims that are a problem (unsupported or outdated)", "R-4"],
    ["True claims tied to the right fact", "R-4:supported"],
  ];
  const cell = (c: ClassMetrics) => `${pct(c.precision)} / ${pct(c.recall)}`;
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-slate-700">
        Latest finished run: <strong>{fmtDate(run.finished_at)}</strong>, {metrics.cases} drafts{metrics.errors ? `, ${metrics.errors} could not be scored because the AI request failed` : ""}. Model: {metrics.models.join(", ") || run.model}.
      </p>
      {ai.rescored ? (
        <p className="text-xs text-slate-600">The AI’s answers were saved when the run was made. They are scored with the checking code that is deployed now, so these figures stay honest after a code change, without new AI requests.</p>
      ) : null}
      <div className="overflow-x-auto" role="region" aria-label="Scrollable table" tabIndex={0}>
        <table className="min-w-full divide-y divide-slate-200">
          <caption className="sr-only">AI step compared with keyword matching on the same drafts (precision / recall)</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>Measure</th>
              <th scope="col" className={th}>Keyword matching alone</th>
              <th scope="col" className={th}>With the AI step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([label, k]) => (
              <tr key={k}>
                <th scope="row" className={`${td} text-left font-medium`}>{label}</th>
                <td className={td}>{cell(metrics.rules.classes[k])}</td>
                <td className={`${td} font-semibold`}>{cell(metrics.ai.classes[k])}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className={`${td} text-left font-medium`}>Right verdict on claims that were found</th>
              <td className={td}>{metrics.rules.r4.verdictOk} of {metrics.rules.r4.verdictOk + metrics.rules.r4.verdictWrong}</td>
              <td className={`${td} font-semibold`}>{metrics.ai.r4.verdictOk} of {metrics.ai.r4.verdictOk + metrics.ai.r4.verdictWrong}</td>
            </tr>
            <tr>
              <th scope="row" className={`${td} text-left font-medium`}>Good drafts flagged wrongly (clean controls)</th>
              <td className={td}>{metrics.rules.cleanControls.withFalseAlarm} of {metrics.rules.cleanControls.total}</td>
              <td className={`${td} font-semibold`}>{metrics.ai.cleanControls.withFalseAlarm} of {metrics.ai.cleanControls.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">Each cell reads precision / recall. Only claim checks (R-4) are compared, because the other rules do not use the AI.</p>
      {metrics.calibration.length ? (
        <div>
          <h3 className="text-sm font-semibold text-navy">Do the confidence labels mean something?</h3>
          <p className="text-sm text-slate-700">A label is useful only if “Medium” findings are right more often than “Low” ones.</p>
          <ul className="mt-2 text-sm text-slate-800">
            {metrics.calibration.map((c) => (
              <li key={c.conf}>
                <strong>{c.conf === "medium" ? "Medium" : c.conf === "low" ? "Low" : c.conf}</strong> confidence AI findings: {c.right} of {c.n} right ({c.n ? Math.round((c.right / c.n) * 100) : 0}%)
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {failures.length ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-teal">Show the {failures.length} drafts where the AI step was wrong</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {failures.map((f) => (
              <li key={f.id} className="rounded-md border border-slate-200 p-3">
                <p className="text-slate-900">
                  <span className="font-mono text-xs text-slate-600">{f.id}</span> “{f.text}”
                </p>
                <ul className="mt-1 list-disc pl-5 text-slate-700">
                  {f.missed.map((x, i) => (
                    <li key={`m${i}`}>Missed {x}</li>
                  ))}
                  {f.extra.map((x, i) => (
                    <li key={`e${i}`}>False alarm {x}</li>
                  ))}
                  {f.verdict.map((x, i) => (
                    <li key={`v${i}`}>Verdict: {x}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
