import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, editDraft, recheckDraft, reviewDecision, submitForReview } from "@/app/actions";
import FindingCard from "@/app/components/FindingCard";
import HighlightedBody from "@/app/components/HighlightedBody";
import SubmitButton from "@/app/components/SubmitButton";
import { Card, ErrorBanner, StatusBadge, btnDanger, btnPrimary, btnSecondary, fmtDate, inputCls } from "@/app/components/ui";
import { requireUser } from "@/lib/session";
import { canSubmit, isOpen, summarize } from "@/lib/status";
import { db } from "@/lib/store";
import type { AuditEntry, Comment, Draft, Finding, Revision } from "@/lib/types";

export const maxDuration = 60;

const STEPS = ["Check", "Resolve", "Review", "Approved"];
const stepIndex = (d: Draft, open: number) =>
  d.status === "approved" ? 3 : d.status === "in_review" ? 2 : open === 0 ? 1 : 0;

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { user, sessionId } = await requireUser();
  const store = await db();
  const draft = await store.get<Draft>("drafts", id);
  if (!draft || draft.session_id !== sessionId) notFound();

  const [findings, revisions, comments, checks] = await Promise.all([
    store.select<Finding>("findings", { draft_id: id }),
    store.select<Revision>("revisions", { draft_id: id }, { col: "rev", asc: false }),
    store.select<Comment>("comments", { draft_id: id }, { col: "created_at", asc: true }),
    store.select<AuditEntry>("audit_log", { draft_id: id, action: "check_run" }, { col: "created_at", asc: false }),
  ]);
  const sum = summarize(findings);
  const gate = canSubmit(findings);
  const editable = draft.status === "draft" || draft.status === "changes_requested";
  const isCreator = user.role === "creator";
  const step = stepIndex(draft, sum.open);

  const rank = (f: Finding) => (isOpen(f) ? 0 : f.decision === "disputed" ? 1 : f.verdict === "supported" && f.decision === "pending" ? 2 : 3);
  const sorted = [...findings].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/drafts" className="text-sm text-teal underline">
          ← All drafts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-navy">{draft.title}</h1>
          <StatusBadge s={draft.status} />
        </div>
        <p className="text-sm text-slate-500">
          {draft.channel} · revision {draft.rev} · updated {fmtDate(draft.updated_at)}
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-full border px-3 py-1 ${i < step ? "border-teal bg-tint text-teal" : i === step ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-500"}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card title="Draft text">
            <HighlightedBody body={draft.body} findings={findings} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-200 align-middle" />
                Needs action
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-200 align-middle" />
                Guideline issue
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200 align-middle" />
                Supported by a fact
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-violet-200 align-middle" />
                Disputed
              </span>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {checks[0] ? `Last check ${fmtDate(checks[0].created_at)}: ${checks[0].detail}` : "Not checked yet."}
            </p>
            {isCreator && editable ? (
              <div className="mt-3 space-y-3">
                <details className="rounded border border-slate-200">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Edit the text yourself</summary>
                  <form action={editDraft} className="space-y-2 border-t border-slate-200 p-3">
                    <input type="hidden" name="draft_id" value={draft.id} />
                    <label htmlFor="body" className="sr-only">
                      Draft text
                    </label>
                    <textarea id="body" name="body" defaultValue={draft.body} rows={8} required minLength={10} maxLength={4000} className={inputCls} />
                    <SubmitButton className={btnPrimary} pending="Saving and re-checking…">
                      Save as a new revision and re-check
                    </SubmitButton>
                  </form>
                </details>
                <form action={recheckDraft}>
                  <input type="hidden" name="draft_id" value={draft.id} />
                  <SubmitButton className={btnSecondary} pending="Re-checking…">
                    Re-check against the latest guidelines and facts
                  </SubmitButton>
                </form>
              </div>
            ) : null}
          </Card>

          <Card title={`Discussion (${comments.length})`}>
            {comments.length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : null}
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded bg-slate-50 px-3 py-2 text-sm">
                  <p className="text-xs text-slate-500">
                    {c.author_name} ({c.author_role}) · {fmtDate(c.created_at)}
                  </p>
                  <p className="text-slate-800">{c.body}</p>
                </li>
              ))}
            </ul>
            <form action={addComment} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="draft_id" value={draft.id} />
              <label htmlFor="comment" className="sr-only">
                Add a comment
              </label>
              <input id="comment" name="body" required minLength={2} maxLength={500} placeholder="Add a comment" className={`${inputCls} flex-1 basis-56`} />
              <SubmitButton className={btnSecondary}>Post comment</SubmitButton>
            </form>
          </Card>

          <Card title={`Revision history (${revisions.length})`}>
            <ul className="space-y-2 text-sm">
              {revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <span>
                    <span className="font-medium text-navy">Revision {r.rev}</span> · {r.note}
                  </span>
                  <span className="text-xs text-slate-500">
                    {r.actor_name} · {fmtDate(r.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card title="Decision">
            <p className="text-sm text-slate-700">
              {sum.total} finding{sum.total === 1 ? "" : "s"}: <strong>{sum.open}</strong> open ({sum.openHigh} high risk), {sum.disputed} disputed, {sum.supported} supported by facts.
            </p>

            {isCreator && editable ? (
              <form action={submitForReview} className="mt-3 space-y-2">
                <input type="hidden" name="draft_id" value={draft.id} />
                <SubmitButton className={btnPrimary} disabled={!gate.ok} pending="Sending…">
                  Send to review
                </SubmitButton>
                {!gate.ok ? <p className="text-sm text-red-700">{gate.reason}</p> : null}
              </form>
            ) : null}

            {draft.status === "in_review" && user.role === "reviewer" ? (
              <form action={reviewDecision} className="mt-3 space-y-2">
                <input type="hidden" name="draft_id" value={draft.id} />
                <label htmlFor="rv-comment" className="block text-sm font-medium text-slate-700">
                  Note to the author (required if you ask for changes)
                </label>
                <textarea id="rv-comment" name="comment" rows={3} maxLength={500} className={inputCls} />
                <div className="flex flex-wrap gap-2">
                  <button name="outcome" value="approve" className={btnPrimary}>
                    Approve
                  </button>
                  <button name="outcome" value="changes" className={btnDanger}>
                    Request changes
                  </button>
                </div>
                {sum.disputed > 0 ? (
                  <p className="text-xs text-violet-800">The author disputed {sum.disputed} finding{sum.disputed > 1 ? "s" : ""}. Read the reasons before approving.</p>
                ) : null}
              </form>
            ) : null}

            {draft.status === "in_review" && user.role !== "reviewer" ? (
              <p className="mt-3 rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">Waiting for a reviewer. Switch to Elena (Reviewer) to decide.</p>
            ) : null}
            {draft.status === "changes_requested" ? (
              <p className="mt-3 rounded bg-orange-50 px-3 py-2 text-sm text-orange-900">The reviewer asked for changes. See the discussion, edit the draft, then send it again.</p>
            ) : null}
            {draft.status === "approved" ? (
              <div className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Approved by a human reviewer. This is the only state that means it can be published.{" "}
                <a className="underline" href={`/drafts/${draft.id}/report`}>
                  Download the check report
                </a>
              </div>
            ) : null}
            {!isCreator && editable ? <p className="mt-3 text-sm text-slate-600">The author is still working on this draft.</p> : null}
          </Card>

          <section aria-labelledby="findings-h" className="space-y-3">
            <h2 id="findings-h" className="text-base font-semibold text-navy">
              Findings
            </h2>
            {sorted.length === 0 ? (
              <Card>
                <p className="text-sm text-emerald-800">No issues found against the current guidelines and facts.</p>
              </Card>
            ) : null}
            {sorted.map((f) => (
              <FindingCard key={f.id} f={f} draftId={draft.id} canAct={isCreator && editable} />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
