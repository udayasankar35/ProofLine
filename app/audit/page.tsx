import { requireUser } from "@/lib/session";
import { db } from "@/lib/store";
import type { AuditEntry } from "@/lib/types";
import { Card, fmtDate } from "../components/ui";

const LABEL: Record<string, string> = {
  login: "Entered the demo",
  draft_created: "Draft created",
  check_run: "Check run",
  ai_call: "AI request",
  draft_edited: "Draft edited",
  finding_accepted: "Fix applied",
  finding_confirmed: "Claim confirmed",
  finding_disputed: "Finding disputed",
  finding_reopened: "Dispute withdrawn",
  submitted: "Sent to review",
  approved: "Approved",
  changes_requested: "Changes requested",
  comment: "Comment",
  fact_added: "Fact added",
  fact_expiry_changed: "Fact expiry changed",
  term_added: "Term added",
  knowledge_reset: "Demo data restored",
};

export default async function AuditPage() {
  const { sessionId } = await requireUser();
  const store = await db();
  const entries = await store.select<AuditEntry>("audit_log", { session_id: sessionId }, { col: "created_at", asc: false });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-navy">Audit trail</h1>
        <p className="text-sm text-slate-600">
          Every check, decision, approval and AI request in this session, newest first. Entries cannot be edited from the app.
        </p>
      </div>
      <Card>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.slice(0, 200).map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <span className="font-medium text-navy">{LABEL[e.action] ?? e.action}</span>{" "}
                    <span className="text-slate-500">
                      by {e.actor_name} ({e.actor_role})
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">{fmtDate(e.created_at)}</p>
                </div>
                <p className="text-slate-700">{e.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
