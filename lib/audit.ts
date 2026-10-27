import { db, newId, nowIso } from "./store";
import type { User } from "./types";

/** Appends one line to the audit trail. Never throws: logging must not break a user action. */
export async function audit(
  sessionId: string,
  actor: Pick<User, "name" | "role"> | { name: string; role: string },
  action: string,
  detail: string,
  draftId = "",
) {
  try {
    const store = await db();
    await store.insert("audit_log", {
      id: newId("A-"),
      session_id: sessionId,
      draft_id: draftId,
      actor_name: actor.name,
      actor_role: actor.role,
      action,
      detail: detail.slice(0, 500),
      created_at: nowIso(),
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}
