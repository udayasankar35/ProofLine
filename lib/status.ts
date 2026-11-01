import type { DraftStatus, Finding } from "./types";

export const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  reflagged: "Re-review needed",
};

/** A draft can be changed by its author only while it is being worked on (or after its evidence changed). */
export const isEditable = (s: DraftStatus) => s === "draft" || s === "changes_requested" || s === "reflagged";

/** A finding still needs a human decision (supported claims only need a quick confirmation, so they are not blocking). */
export const isOpen = (f: Finding) => f.decision === "pending" && f.verdict !== "supported";

export function summarize(findings: Finding[]) {
  const open = findings.filter(isOpen);
  return {
    total: findings.length,
    open: open.length,
    openHigh: open.filter((f) => f.severity === "high").length,
    disputed: findings.filter((f) => f.decision === "disputed").length,
    accepted: findings.filter((f) => f.decision === "accepted").length,
    supported: findings.filter((f) => f.verdict === "supported").length,
  };
}

export function canSubmit(findings: Finding[]): { ok: boolean; reason: string } {
  const s = summarize(findings);
  if (s.openHigh > 0) {
    return {
      ok: false,
      reason: `${s.openHigh} high-risk finding${s.openHigh > 1 ? "s" : ""} still open. Fix each one, or dispute it with a reason, before sending to review.`,
    };
  }
  return { ok: true, reason: "" };
}
