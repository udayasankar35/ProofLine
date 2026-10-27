import Link from "next/link";
import { requireUser } from "@/lib/session";
import { summarize } from "@/lib/status";
import { db } from "@/lib/store";
import type { Draft, Finding } from "@/lib/types";
import { Card, StatusBadge, fmtDate } from "../components/ui";

export default async function ReviewPage() {
  const { user, sessionId } = await requireUser();
  const store = await db();
  const drafts = await store.select<Draft>("drafts", { session_id: sessionId }, { col: "updated_at", asc: false });
  const queue = drafts.filter((d) => d.status === "in_review");
  const done = drafts.filter((d) => d.status === "approved" || d.status === "changes_requested");
  const sums = new Map<string, ReturnType<typeof summarize>>();
  for (const d of drafts) sums.set(d.id, summarize(await store.select<Finding>("findings", { draft_id: d.id })));

  const row = (d: Draft) => {
    const s = sums.get(d.id)!;
    return (
      <li key={d.id}>
        <Link
          href={`/drafts/${d.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy">{d.title}</p>
            <p className="text-xs text-slate-500">
              {d.channel} · revision {d.rev} · {fmtDate(d.updated_at)}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {s.disputed ? <span className="text-violet-800">{s.disputed} disputed</span> : null}
            <span>{s.total} findings</span>
            <StatusBadge s={d.status} />
          </div>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Review queue</h1>
        <p className="text-sm text-slate-600">Drafts sent for review in this session. Only a reviewer can approve.</p>
      </div>
      <section aria-labelledby="waiting">
        <h2 id="waiting" className="mb-2 text-base font-semibold text-navy">
          Waiting for review ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-700">
              Nothing is waiting.{" "}
              {user.role === "reviewer"
                ? "Switch to Devon (Creator), check a draft and send it to review. It will appear here."
                : "Send a draft to review from its page and it will appear here."}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">{queue.map(row)}</ul>
        )}
      </section>
      {done.length > 0 ? (
        <section aria-labelledby="decided">
          <h2 id="decided" className="mb-2 text-base font-semibold text-navy">
            Decided
          </h2>
          <ul className="space-y-3">{done.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
