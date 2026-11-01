import { audit } from "./audit";
import { db, todayIso } from "./store";
import type { User } from "./types";

export const perSessionCap = () => Number(process.env.AI_SESSION_CAP || 20);
export const perDayCap = () => Number(process.env.AI_DAILY_CAP || 400);

/**
 * Counts one AI request against this session's limit and the daily limit.
 * Returns false (and records nothing) when a limit is reached, so the caller can fall back to rules only.
 */
export async function reserveAiCall(
  sessionId: string,
  actor: Pick<User, "name" | "role">,
  detail: string,
  draftId = "",
): Promise<boolean> {
  const store = await db();
  const startOfDay = `${todayIso()}T00:00:00.000Z`;
  const [mine, all] = await Promise.all([
    store.count("audit_log", { action: "ai_call", session_id: sessionId }),
    store.count("audit_log", { action: "ai_call" }, { col: "created_at", value: startOfDay }),
  ]);
  if (mine >= perSessionCap() || all >= perDayCap()) return false;
  await audit(sessionId, actor, "ai_call", detail, draftId);
  return true;
}
