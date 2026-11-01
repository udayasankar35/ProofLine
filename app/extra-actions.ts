"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { loadSampleHistory, removeSampleHistory } from "@/lib/history";
import { requireUser } from "@/lib/session";
import { db, newId, nowIso } from "@/lib/store";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function addSampleHistory() {
  const { sessionId } = await requireUser();
  const n = await loadSampleHistory(sessionId);
  revalidatePath("/insights");
  redirect(`/insights?notice=${encodeURIComponent(n ? `Added ${n} fictional sample drafts with their history.` : "The sample history is already loaded.")}`);
}

export async function clearSampleHistory() {
  const { sessionId } = await requireUser();
  const n = await removeSampleHistory(sessionId);
  revalidatePath("/insights");
  redirect(`/insights?notice=${encodeURIComponent(n ? `Removed ${n} sample drafts.` : "There was no sample history to remove.")}`);
}

export async function submitFeedback(formData: FormData) {
  const { user, sessionId } = await requireUser();
  const completed = str(formData, "completed");
  const ease = Number(str(formData, "ease"));
  const confusing = str(formData, "confusing").slice(0, 600);
  const wanted = str(formData, "wanted").slice(0, 600);
  if (!["yes", "partly", "no"].includes(completed)) redirect(`/feedback?error=${encodeURIComponent("Tell us whether you could finish the main task.")}`);
  if (!(ease >= 1 && ease <= 5)) redirect(`/feedback?error=${encodeURIComponent("Pick a rating from 1 to 5 for how easy it was.")}`);
  const store = await db();
  const mine = await store.count("feedback", { session_id: sessionId });
  if (mine >= 5) redirect(`/feedback?error=${encodeURIComponent("Thank you. You have already sent several responses from this session.")}`);
  await store.insert("feedback", { id: newId("fb-"), session_id: sessionId, role: user.role, completed, ease, confusing, wanted, created_at: nowIso() });
  await audit(sessionId, user, "feedback", `Feedback sent (ease ${ease}/5, completed: ${completed}).`);
  redirect(`/feedback?notice=${encodeURIComponent("Thank you, your feedback was saved.")}`);
}
