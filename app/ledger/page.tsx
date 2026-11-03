import Link from "next/link";
import { Card, StatusBadge, fmtDate } from "@/app/components/ui";
import { loadKnowledge } from "@/lib/knowledge";
import { isBroken, sweepWorkspace } from "@/lib/ledger";
import { requireUser } from "@/lib/session";
import { db, todayIso } from "@/lib/store";
import type { Draft, LedgerEntry } from "@/lib/types";

export const metadata = { title: "Evidence ledger" };

const STATE: Record<string, { label: string; cls: string }> = {
  ok: { label: "Evidence valid", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  exception: { label: "Reviewer exception", cls: "border-violet-300 bg-violet-50 text-violet-800" },
  expired: { label: "Evidence expired", cls: "border-orange-300 bg-orange-50 text-orange-800" },
  changed: { label: "Fact changed", cls: "border-red-300 bg-red-50 text-red-800" },
  removed: { label: "Fact removed", cls: "border-red-300 bg-red-50 text-red-800" },
};

export default async function LedgerPage() {
  const { sessionId } = await requireUser();
  const store = await db();
  const swept = await sweepWorkspace(sessionId);
  const [drafts, entries, k] = await Promise.all([
    store.select<Draft>("drafts", { session_id: sessionId }, { col: "approved_at", asc: false }),
    store.select<LedgerEntry>("ledger_entries", { session_id: sessionId }),
    loadKnowledge(sessionId),
  ]);
  const live = drafts.filter((d) => d.status === "approved" || d.status === "reflagged");
  const liveEntries = entries.filter((e) => live.some((d) => d.id === e.draft_id && d.rev === e.rev));
  const today = todayIso();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 60);
  const soonIso = soon.toISOString().slice(0, 10);

  const byFact = new Map<string, LedgerEntry[]>();
  for (const e of liveEntries) if (e.fact_id) byFact.set(e.fact_id, [...(byFact.get(e.fact_id) ?? []), e]);
  const factIds = [...byFact.keys()].sort();
  const title = (id: string) => drafts.find((d) => d.id === id)?.title ?? id;
  const reflagged = live.filter((d) => d.status === "reflagged").length;
  const exceptions = liveEntries.filter((e) => e.status === "exception").length;
  const lastChecked = liveEntries.map((e) => e.checked_at).sort().pop();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Evidence ledger</h1>
        <p className="text-sm text-slate-600">
          For every approved piece: each claim, the approved fact that backs it (as it was at approval), and who approved it. If a fact expires, changes or is removed, every piece that relies on it is re-flagged.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Checked automatically whenever a fact changes, whenever a list or dashboard page opens, and once a day by a scheduled job{lastChecked ? `. Last check: ${fmtDate(lastChecked)}` : ""}.
        </p>
      </div>

      {swept.reflagged.length ? (
        <div role="status" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          Just re-flagged: {swept.reflagged.map((d) => `“${d.title}”`).join(", ")}.
        </div>
      ) : null}

      {live.length === 0 ? (
        <Card>
          <p className="font-medium text-slate-900">No approved pieces yet.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>As Devon (Creator), check a draft and send it to review.</li>
            <li>As Elena (Reviewer), approve it. Its claims and the facts behind them are written to this ledger.</li>
            <li>As Asha (Admin), change or expire one of those facts and come back: the piece is re-flagged.</li>
          </ol>
          <Link href="/drafts" className="mt-3 inline-block text-sm text-teal underline">
            Go to drafts
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Approved pieces", live.length - reflagged],
              ["Re-flagged", reflagged],
              ["Ledger entries", liveEntries.length],
              ["Reviewer exceptions", exceptions],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-2xl font-bold text-navy">{n}</p>
                <p className="text-xs text-slate-600">{label}</p>
              </div>
            ))}
          </div>

          <Card title="By approved fact: what breaks if it changes">
            {factIds.length === 0 ? (
              <p className="text-sm text-slate-600">No approved piece relies on a specific fact yet.</p>
            ) : (
              <ul className="space-y-3">
                {factIds.map((id) => {
                  const current = k.facts.find((f) => f.id === id);
                  const list = byFact.get(id)!;
                  const pieces = [...new Set(list.map((e) => e.draft_id))];
                  const state = !current ? "Removed" : current.expires_on < today ? "Expired" : current.expires_on <= soonIso ? "Expires soon" : "In date";
                  const cls = state === "In date" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : state === "Expires soon" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-red-300 bg-red-50 text-red-800";
                  return (
                    <li key={id} className="rounded border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{state}</span>
                        {current ? <span className="text-xs text-slate-600">valid until {current.expires_on}</span> : null}
                      </div>
                      <p className="mt-1 text-slate-900">{current?.statement ?? list[0].fact_statement}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Relied on by {pieces.length} approved piece{pieces.length === 1 ? "" : "s"}:{" "}
                        {pieces.map((p, i) => (
                          <span key={p}>
                            {i ? ", " : ""}
                            <Link href={`/drafts/${p}`} className="text-teal underline">
                              {title(p)}
                            </Link>
                          </span>
                        ))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Approved pieces">
            <ul className="space-y-4">
              {live.map((d) => {
                const mine = liveEntries.filter((e) => e.draft_id === d.id);
                return (
                  <li key={d.id} className="rounded border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/drafts/${d.id}`} className="font-semibold text-navy underline-offset-2 hover:underline">
                        {d.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <StatusBadge s={d.status} />
                        <span>
                          approved by {d.approved_by || "a reviewer"} · {d.approved_at ? fmtDate(d.approved_at) : ""}
                        </span>
                      </div>
                    </div>
                    {mine.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-600">No claims needed evidence in this piece.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {mine.map((e) => (
                          <li key={e.id} className="flex flex-wrap items-start gap-2">
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATE[e.status].cls}`}>{STATE[e.status].label}</span>
                            <span>
                              <span className="font-mono text-slate-900">“{e.claim}”</span>
                              <span className="text-slate-600"> → {e.fact_id ? `${e.fact_id} (${e.fact_source})` : e.note}</span>
                              {isBroken(e.status) ? <span className="block text-xs text-red-800">{e.status_note}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
