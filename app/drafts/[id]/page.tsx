import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, editDraft, recheckDraft, replaceFile, rereadFile, reviewDecision, setAltText, submitForReview } from "@/app/actions";
import FindingCard from "@/app/components/FindingCard";
import HighlightedBody from "@/app/components/HighlightedBody";
import SubmitButton from "@/app/components/SubmitButton";
import { Card, ErrorBanner, NoticeBanner, StatusBadge, btnDanger, btnPrimary, btnSecondary, fmtDate, inputCls } from "@/app/components/ui";
import { measuredFor } from "@/lib/eval/summary";
import { isBroken, sweepWorkspace } from "@/lib/ledger";
import { requireUser } from "@/lib/session";
import { canSubmit, isEditable, isOpen, summarize } from "@/lib/status";
import { db } from "@/lib/store";
import type { AuditEntry, Comment, Draft, DraftFile, Finding, LedgerEntry, Revision } from "@/lib/types";
import { parseVisual } from "@/lib/visual";

export const maxDuration = 120;

const STEPS = ["Check", "Resolve", "Review", "Approved"];
const stepIndex = (d: Draft, open: number) =>
  d.status === "approved" || d.status === "reflagged" ? 3 : d.status === "in_review" ? 2 : open === 0 ? 1 : 0;

const SOURCE_LABEL = { text: "Typed text", docx: "Word document", pdf: "PDF", image: "Image" } as const;
const ENTRY_STYLE: Record<string, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
  exception: "border-violet-300 bg-violet-50 text-violet-800",
  expired: "border-orange-300 bg-orange-50 text-orange-800",
  changed: "border-red-300 bg-red-50 text-red-800",
  removed: "border-red-300 bg-red-50 text-red-800",
};
const ENTRY_LABEL: Record<string, string> = { ok: "Evidence valid", exception: "Reviewer exception", expired: "Evidence expired", changed: "Fact changed", removed: "Fact removed" };

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const { user, sessionId } = await requireUser();
  const store = await db();
  await sweepWorkspace(sessionId);
  const draft = await store.get<Draft>("drafts", id);
  if (!draft || draft.session_id !== sessionId) notFound();

  const [findings, revisions, comments, checks, files, ledger] = await Promise.all([
    store.select<Finding>("findings", { draft_id: id }),
    store.select<Revision>("revisions", { draft_id: id }, { col: "rev", asc: false }),
    store.select<Comment>("comments", { draft_id: id }, { col: "created_at", asc: true }),
    store.select<AuditEntry>("audit_log", { draft_id: id, action: "check_run" }, { col: "created_at", asc: false }),
    draft.source_type === "text" ? Promise.resolve([] as Pick<DraftFile, "id" | "name" | "mime" | "size">[]) : store.select<Pick<DraftFile, "id" | "name" | "mime" | "size">>("draft_files", { draft_id: id }, undefined, "id,name,mime,size"),
    draft.status === "approved" || draft.status === "reflagged" ? store.select<LedgerEntry>("ledger_entries", { draft_id: id, rev: draft.rev }) : Promise.resolve([] as LedgerEntry[]),
  ]);
  const sum = summarize(findings);
  const gate = canSubmit(findings);
  const editable = isEditable(draft.status);
  const isCreator = user.role === "creator";
  const step = stepIndex(draft, sum.open);
  const file = files[0];
  const visual = parseVisual(draft.visual);
  const isFile = draft.source_type !== "text";
  const broken = ledger.filter((e) => isBroken(e.status));
  const measured = await measuredFor();

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
          {draft.is_sample ? <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">Sample history</span> : null}
        </div>
        <p className="text-sm text-slate-500">
          {draft.channel} · {SOURCE_LABEL[draft.source_type]}
          {draft.source_name ? ` (${draft.source_name})` : ""} · revision {draft.rev} · updated {fmtDate(draft.updated_at)}
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
      <NoticeBanner message={notice} />

      {draft.status === "reflagged" ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Re-review needed: the evidence behind this approved piece changed.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {broken.map((e) => (
              <li key={e.id}>
                “{e.claim}”: {e.status_note}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            {isCreator
              ? "Edit the text to remove or replace those claims (this starts a new revision), or ask the admin for a current, sourced fact. It then goes back to a reviewer."
              : "The author has to revise this piece. Switch to Devon (Creator), or ask the admin to restore the evidence."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {isFile ? (
            <Card title={draft.source_type === "image" ? "Image and accessibility" : "Uploaded file"}>
              <div className="space-y-3 text-sm">
                <p className="text-slate-700">
                  <strong>{draft.source_name || file?.name}</strong>
                  {file ? ` · ${(file.size / 1024).toFixed(0)} KB` : ""}
                  {file ? (
                    <>
                      {" · "}
                      <a className="text-teal underline" href={`/api/files/${file.id}`} target={draft.source_type === "docx" ? undefined : "_blank"} rel="noreferrer">
                        {draft.source_type === "docx" ? "Download the original" : "Open the original"}
                      </a>
                    </>
                  ) : (
                    <span className="text-slate-500"> · the original file is no longer stored (files are kept for 3 days)</span>
                  )}
                </p>
                {draft.source_type === "image" && file ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${file.id}`} alt={draft.alt_text || "Uploaded image (no alt text yet)"} className="max-h-72 w-auto max-w-full rounded border border-slate-200" />
                ) : null}
                {draft.extract_note ? <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">{draft.extract_note}</p> : null}

                {draft.source_type === "image" ? (
                  isCreator && editable ? (
                    <form action={setAltText} className="space-y-2">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <label htmlFor="alt" className="block font-medium text-slate-800">
                        Alt text <span className="font-normal text-slate-500">(required before review)</span>
                      </label>
                      <textarea id="alt" name="alt" rows={2} maxLength={300} defaultValue={draft.alt_text} className={inputCls} placeholder="One plain sentence that says what the image shows" />
                      {visual?.suggested_alt ? (
                        <p className="text-xs text-slate-600">
                          AI suggestion (edit before using): <em>“{visual.suggested_alt}”</em>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton className={btnPrimary} pending="Saving and re-checking…">
                          Save alt text and re-check
                        </SubmitButton>
                      </div>
                    </form>
                  ) : (
                    <p className="text-slate-700">
                      <span className="font-medium">Alt text:</span> {draft.alt_text || "none"}
                    </p>
                  )
                ) : null}

                {isCreator && editable ? (
                  <div className="flex flex-wrap items-start gap-3 border-t border-slate-100 pt-3">
                    <details className="min-w-0 flex-1 basis-64 rounded border border-slate-200">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Upload a new version</summary>
                      <form action={replaceFile} className="space-y-2 border-t border-slate-200 p-3">
                        <input type="hidden" name="draft_id" value={draft.id} />
                        <label htmlFor="newfile" className="block text-xs text-slate-600">
                          After you fix the original file, upload it again. This becomes a new revision.
                        </label>
                        <input id="newfile" name="file" type="file" required accept=".docx,.pdf,.png,.jpg,.jpeg,.webp" className={inputCls} />
                        <SubmitButton className={btnPrimary} pending="Reading your file…">
                          Upload and re-check
                        </SubmitButton>
                      </form>
                    </details>
                    {draft.source_type !== "docx" && file ? (
                      <form action={rereadFile}>
                        <input type="hidden" name="draft_id" value={draft.id} />
                        <SubmitButton className={btnSecondary} pending="Reading the file again…">
                          Read the file again
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card title={isFile ? "Text read from the file" : "Draft text"}>
            {draft.body ? (
              <HighlightedBody body={draft.body} findings={findings.filter((f) => f.target === "body")} />
            ) : (
              <p className="text-sm text-slate-600">No text is stored for this {SOURCE_LABEL[draft.source_type].toLowerCase()} yet. {isCreator && editable ? "If the image shows words, type them below so they can be checked." : ""}</p>
            )}
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
            {isFile && draft.body ? (
              <p className="mt-2 text-xs text-slate-600">
                Fixes change this text copy only, not your original file.{" "}
                <a className="text-teal underline" href={`/drafts/${draft.id}/text`}>
                  Download the corrected text
                </a>{" "}
                and paste it into your file, or fix the file and use “Upload a new version”.
              </p>
            ) : null}
            {isCreator && editable ? (
              <div className="mt-3 space-y-3">
                <details className="rounded border border-slate-200">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Edit the text yourself</summary>
                  <form action={editDraft} className="space-y-2 border-t border-slate-200 p-3">
                    <input type="hidden" name="draft_id" value={draft.id} />
                    <label htmlFor="body" className="sr-only">
                      Draft text
                    </label>
                    <textarea id="body" name="body" defaultValue={draft.body} rows={8} required={draft.source_type !== "image"} minLength={draft.source_type === "image" ? undefined : 10} maxLength={isFile ? 12000 : 4000} className={inputCls} />
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

          {ledger.length > 0 ? (
            <Card title="Evidence ledger">
              <p className="mb-3 text-sm text-slate-600">
                What stands behind this approved piece, as it was when {draft.approved_by || "the reviewer"} approved it. If a fact below expires, changes or is removed, the piece is re-flagged automatically.
              </p>
              <ul className="space-y-3">
                {ledger.map((e) => (
                  <li key={e.id} className="rounded border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ENTRY_STYLE[e.status]}`}>{ENTRY_LABEL[e.status]}</span>
                      <span className="text-xs text-slate-500">{e.basis}</span>
                    </div>
                    <p className="mt-1 font-mono text-slate-900">“{e.claim}”</p>
                    {e.fact_id ? (
                      <p className="mt-1 text-slate-700">
                        <span className="rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{e.fact_id}</span> {e.fact_statement}
                        <span className="block text-xs text-slate-500">
                          Source: {e.fact_source} · Owner: {e.fact_owner} · Valid until {e.fact_expires_on}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-slate-700">{e.note}</p>
                    )}
                    {e.status_note ? <p className="mt-1 text-xs text-red-800">{e.status_note}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">
                      Approved by {e.approved_by} · {fmtDate(e.approved_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

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
                  {draft.status === "reflagged" ? "Send for re-review" : "Send to review"}
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
                {sum.open > 0 ? <p className="text-xs text-slate-600">{sum.open} finding{sum.open > 1 ? "s are" : " is"} still open. If you approve, they are recorded in the evidence ledger as reviewer exceptions.</p> : null}
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
                Approved by {draft.approved_by || "a human reviewer"}. This is the only state that means it can be published.{" "}
                <a className="underline" href={`/drafts/${draft.id}/report`}>
                  Download the check report
                </a>
              </div>
            ) : null}
            {draft.status === "reflagged" ? (
              <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-900">Do not publish or keep publishing this piece until it is revised and approved again.</p>
            ) : null}
            {!isCreator && editable && draft.status !== "reflagged" ? <p className="mt-3 text-sm text-slate-600">The author is still working on this draft.</p> : null}
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
              <FindingCard key={f.id} f={f} draftId={draft.id} canAct={isCreator && editable} measured={measured(f)} />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
