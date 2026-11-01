import { db } from "./store";
import type { Draft } from "./types";

/** Deletes everything one visitor session created: drafts, files, findings, ledger, history and its own guidelines and facts. */
export async function purgeSession(sessionId: string) {
  const store = await db();
  const drafts = await store.select<Draft>("drafts", { session_id: sessionId });
  for (const d of drafts) {
    for (const t of ["findings", "revisions", "comments", "draft_files", "ledger_entries", "finding_events"] as const) {
      await store.deleteWhere(t, { draft_id: d.id });
    }
  }
  await store.deleteWhere("drafts", { session_id: sessionId });
  for (const t of ["ledger_entries", "finding_events", "draft_files", "audit_log"] as const) {
    await store.deleteWhere(t, { session_id: sessionId });
  }
  for (const t of ["guidelines", "facts", "terms", "disclaimers"] as const) await store.deleteWhere(t, { ws: sessionId });
  return drafts.length;
}
