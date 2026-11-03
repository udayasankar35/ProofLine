import { decideFinding } from "@/app/actions";
import type { Finding } from "@/lib/types";
import SubmitButton from "./SubmitButton";
import { ConfidenceBadge, OriginBadge, SeverityBadge, VerdictBadge, btnDanger, btnPrimary, btnSecondary, inputCls } from "./ui";

function suggestionText(f: Finding): string {
  if (f.fix_kind === "replace") return `Replace with: “${f.suggestion}”`;
  if (f.fix_kind === "append") return `Add the required text: “${f.suggestion}”`;
  if (f.fix_kind === "remove") return "Remove this wording.";
  if (f.target === "alt") return "Edit the alt text.";
  if (f.target === "visual") return f.rule_id === "R-6" ? "Add alt text (see the image card), or dispute with a reason." : "Check it in your design tool and fix the original file, or dispute with a reason.";
  return f.verdict === "supported" ? "No change needed. Confirm the wording matches the fact." : "Needs a manual edit.";
}

const WHERE: Record<Finding["target"], string> = { body: "", alt: "In the alt text", visual: "About the file or picture" };

export default function FindingCard({
  f,
  draftId,
  canAct,
  measured,
}: {
  f: Finding;
  draftId: string;
  canAct: boolean;
  /** Plain-words precision from the evaluation suite for this kind of finding, e.g. "Measured precision 96% (n=48)." */
  measured?: string;
}) {
  const resolved = f.decision === "accepted";
  return (
    <article id={`f-${f.id}`} className={`scroll-mt-24 rounded-lg border bg-white p-4 ${f.decision === "disputed" ? "border-violet-300" : resolved ? "border-emerald-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge s={f.severity} />
        <VerdictBadge v={f.verdict} />
        <OriginBadge o={f.origin} />
        <ConfidenceBadge c={f.confidence} measured={measured} />
      </div>
      <h3 className="mt-2 text-sm font-semibold text-navy">{f.title}</h3>
      {WHERE[f.target] ? <p className="mt-1 text-xs text-slate-600">{WHERE[f.target]}</p> : null}
      <p className="mt-1 break-words rounded bg-slate-50 px-2 py-1 font-mono text-sm text-slate-800">“{f.quote}”</p>
      <p className="mt-2 text-sm text-slate-700">{f.reason}</p>
      {measured ? <p className="mt-1 text-xs text-slate-600">{measured}</p> : null}

      <details className="mt-2 rounded border border-slate-200 bg-slate-50 text-sm">
        <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">
          Source: <span className="font-mono">{f.source_ref}</span>
        </summary>
        <p className="whitespace-pre-line border-t border-slate-200 px-3 py-2 text-slate-600">{f.source_text || "No source text."}</p>
      </details>

      <p className="mt-2 text-sm text-slate-800">
        <span className="font-medium">Suggested fix:</span> {suggestionText(f)}
      </p>

      {f.decision === "disputed" ? (
        <div className="mt-3 rounded bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <span className="font-medium">Disputed by {f.decided_by}:</span> {f.decision_note}
          {canAct ? (
            <form action={decideFinding} className="mt-2">
              <input type="hidden" name="draft_id" value={draftId} />
              <input type="hidden" name="finding_id" value={f.id} />
              <input type="hidden" name="decision" value="reopen" />
              <SubmitButton className={btnSecondary}>Undo dispute</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {f.decision === "accepted" ? (
        <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="font-medium">Confirmed by {f.decided_by}.</span> {f.decision_note}
        </p>
      ) : null}

      {canAct && f.decision === "pending" ? (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {f.fix_kind !== "manual" ? (
            <form action={decideFinding}>
              <input type="hidden" name="draft_id" value={draftId} />
              <input type="hidden" name="finding_id" value={f.id} />
              <input type="hidden" name="decision" value="accept" />
              <SubmitButton className={btnPrimary} pending="Applying…">
                Apply this fix
              </SubmitButton>
            </form>
          ) : f.verdict === "supported" ? (
            <form action={decideFinding}>
              <input type="hidden" name="draft_id" value={draftId} />
              <input type="hidden" name="finding_id" value={f.id} />
              <input type="hidden" name="decision" value="confirm" />
              <SubmitButton className={btnPrimary}>Confirm it matches the fact</SubmitButton>
            </form>
          ) : (
            <p className="py-2 text-sm text-slate-600">{f.target === "body" ? "Edit the text yourself, or dispute with a reason." : "Fix it at the source, or dispute with a reason."}</p>
          )}
          <details className="min-w-0 flex-1 basis-60">
            <summary className={`${btnDanger} cursor-pointer list-none`}>Dispute</summary>
            <form action={decideFinding} className="mt-2 space-y-2">
              <input type="hidden" name="draft_id" value={draftId} />
              <input type="hidden" name="finding_id" value={f.id} />
              <input type="hidden" name="decision" value="dispute" />
              <label htmlFor={`note-${f.id}`} className="block text-xs font-medium text-slate-700">
                Why is this finding wrong or acceptable? The reviewer will see this.
              </label>
              <input id={`note-${f.id}`} name="note" required minLength={5} maxLength={300} className={inputCls} />
              <SubmitButton className={btnSecondary}>Save dispute</SubmitButton>
            </form>
          </details>
        </div>
      ) : null}
    </article>
  );
}
