import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/store";
import { summarize } from "@/lib/status";
import type { Draft, Finding } from "@/lib/types";
import { Card, StatusBadge, btnPrimary, fmtDate } from "../components/ui";

export default async function DraftsPage() {
  const { user, sessionId } = await requireUser();
  const store = await db();
  const drafts = await store.select<Draft>("drafts", { session_id: sessionId }, { col: "updated_at", asc: false });
  const sums = await Promise.all(
    drafts.map(async (d) => summarize(await store.select<Finding>("findings", { draft_id: d.id }))),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Drafts</h1>
          <p className="text-sm text-slate-600">Your drafts in this demo session. Other visitors cannot see them.</p>
        </div>
        {user.role === "creator" ? (
          <Link href="/drafts/new" className={btnPrimary}>
            New draft
          </Link>
        ) : null}
      </div>

      {drafts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-700">
            No drafts yet in this session.{" "}
            {user.role === "creator"
              ? "Create one and load a sample to see ProofLine check it."
              : "Switch to Devon (Creator) to create a draft, then come back here to review it."}
          </p>
          {user.role === "creator" ? (
            <Link href="/drafts/new" className={`${btnPrimary} mt-4`}>
              Create your first draft
            </Link>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d, i) => (
            <li key={d.id}>
              <Link
                href={`/drafts/${d.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{d.title}</p>
                  <p className="text-xs text-slate-500">
                    {d.channel} · revision {d.rev} · updated {fmtDate(d.updated_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-600">
                    {sums[i].open} open{sums[i].openHigh ? ` (${sums[i].openHigh} high)` : ""}
                    {sums[i].disputed ? ` · ${sums[i].disputed} disputed` : ""}
                  </span>
                  <StatusBadge s={d.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
