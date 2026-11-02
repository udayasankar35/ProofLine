import Link from "next/link";
import { addSampleHistory, clearSampleHistory } from "@/app/extra-actions";
import SubmitButton from "@/app/components/SubmitButton";
import { Card, NoticeBanner, btnDanger, btnPrimary, btnSecondary } from "@/app/components/ui";
import { fmtHours, computeInsights } from "@/lib/insights";
import { sweepWorkspace } from "@/lib/ledger";
import { requireUser } from "@/lib/session";

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ scope?: string; notice?: string }> }) {
  const { sessionId } = await requireUser();
  const { scope, notice } = await searchParams;
  await sweepWorkspace(sessionId);
  const mineOnly = scope === "mine";
  const ins = await computeInsights(sessionId, mineOnly);
  const maxDrafts = Math.max(1, ...ins.topRules.map((r) => r.drafts));
  const empty = ins.drafts.total === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Governance insights</h1>
          <p className="text-sm text-slate-600">What goes wrong most often, which guidelines people dispute, how long approval takes, and which evidence is about to expire.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="Which drafts to include">
          <Link href="/insights" aria-current={!mineOnly ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${!mineOnly ? "bg-navy text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            All drafts
          </Link>
          <Link href="/insights?scope=mine" aria-current={mineOnly ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${mineOnly ? "bg-navy text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            Only my drafts
          </Link>
        </div>
      </div>
      <NoticeBanner message={notice} />

      {ins.drafts.sample > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {mineOnly ? (
            <span>
              <strong>{ins.drafts.sample} fictional sample drafts</strong> are hidden in this view. Choose “All drafts” to include them.
            </span>
          ) : (
            <span>
              Includes <strong>{ins.drafts.sample} fictional sample drafts</strong> with invented history so the charts are not empty. “Only my drafts” leaves them out.
            </span>
          )}
          <form action={clearSampleHistory}>
            <SubmitButton className={btnDanger} pending="Removing…">
              Remove sample history
            </SubmitButton>
          </form>
        </div>
      ) : null}

      {empty ? (
        <Card>
          <p className="font-medium text-slate-900">{mineOnly && ins.drafts.sample > 0 ? "You have no drafts of your own yet." : "No drafts yet, so there is nothing to measure."}</p>
          <p className="mt-1 text-sm text-slate-700">Insights fill in as you check, dispute and approve drafts. To see the dashboard with data right now, load some fictional history.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={addSampleHistory}>
              <SubmitButton className={btnPrimary} pending="Loading…">
                Load sample history
              </SubmitButton>
            </form>
            <Link href="/drafts/new" className={btnSecondary}>
              Create a draft
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Drafts", ins.drafts.total],
              ["Approved", ins.drafts.approved],
              ["In review", ins.drafts.inReview],
              ["Re-flagged", ins.drafts.reflagged],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-2xl font-bold text-navy">{n}</p>
                <p className="text-xs text-slate-600">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Most-triggered rules">
              {ins.topRules.length === 0 ? (
                <p className="text-sm text-slate-600">No rule has fired yet.</p>
              ) : (
                <ul className="space-y-3">
                  {ins.topRules.map((r) => (
                    <li key={r.rule} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span>
                          <span className="mr-1 rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{r.rule}</span>
                          {r.label}
                        </span>
                        <span className="whitespace-nowrap text-slate-600">
                          {r.drafts} draft{r.drafts === 1 ? "" : "s"} · {r.raised} times
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-slate-100" aria-hidden>
                        <div className="h-2 rounded bg-teal" style={{ width: `${Math.round((r.drafts / maxDrafts) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">Counted from every check run, including first drafts, so it shows what people write wrongly the first time.</p>
            </Card>

            <Card title="Most-disputed findings">
              {ins.disputes.length === 0 ? (
                <p className="text-sm text-slate-600">Nobody has disputed a finding yet.</p>
              ) : (
                <ul className="space-y-3">
                  {ins.disputes.map((d) => (
                    <li key={d.rule} className="text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="mr-1 rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{d.rule}</span>
                          {d.label}
                        </span>
                        <span className="whitespace-nowrap text-slate-600">
                          disputed in {d.drafts} draft{d.drafts === 1 ? "" : "s"} ({Math.round(d.rate * 100)}% of drafts it flagged)
                        </span>
                      </div>
                      {d.unclear ? <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Authors often disagree with this one. The guideline behind it may be unclear, so consider rewording it.</p> : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">A high dispute rate is a hint, not proof: it can also mean the rule is right and people need training.</p>
            </Card>

            <Card title="Time to approval">
              {ins.approval.count === 0 ? (
                <p className="text-sm text-slate-600">No draft has been approved yet. Send one to review and approve it as the reviewer.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Median wait in review", fmtHours(ins.approval.medianH)],
                    ["Average wait in review", fmtHours(ins.approval.meanH)],
                    ["Fastest", fmtHours(ins.approval.fastestH)],
                    ["Slowest", fmtHours(ins.approval.slowestH)],
                    ["Median from first draft to approval", fmtHours(ins.approval.startToApprovalMedianH)],
                    ["Approved drafts measured", String(ins.approval.count)],
                  ].map(([dt, dd]) => (
                    <div key={dt} className="rounded border border-slate-200 p-2">
                      <dt className="text-xs text-slate-600">{dt}</dt>
                      <dd className="text-lg font-semibold text-navy">{dd}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>

            <Card title="Facts about to expire">
              {ins.facts.length === 0 ? (
                <p className="text-sm text-slate-600">Every approved fact is in date for more than 60 days.</p>
              ) : (
                <ul className="space-y-3">
                  {ins.facts.map((f) => (
                    <li key={f.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{f.id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${f.state === "expired" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                          {f.state === "expired" ? `Expired ${Math.abs(f.days)} day${Math.abs(f.days) === 1 ? "" : "s"} ago` : f.days === 0 ? "Expires today" : `Expires in ${f.days} day${f.days === 1 ? "" : "s"}`}
                        </span>
                        <span className="text-xs text-slate-500">{f.usedBy} approved piece{f.usedBy === 1 ? "" : "s"} rely on it</span>
                      </div>
                      <p className="mt-1 text-slate-800">{f.statement}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">
                <Link href="/knowledge" className="text-teal underline">
                  Renew or edit facts
                </Link>{" "}
                · <Link href="/ledger" className="text-teal underline">See the evidence ledger</Link>
              </p>
            </Card>
          </div>

          {ins.drafts.sample === 0 ? (
            <form action={addSampleHistory} className="text-sm text-slate-600">
              Want to see this with more data?{" "}
              <button className="text-teal underline">Add fictional sample history</button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
