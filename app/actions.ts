"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { runCheck } from "@/lib/check";
import { applyFix } from "@/lib/rules";
import { USERS } from "@/lib/seed";
import { SESSION_COOKIE, USER_COOKIE, homeFor, requireUser } from "@/lib/session";
import { canSubmit } from "@/lib/status";
import { db, newId, nowIso, resetKnowledge as resetKnowledgeBase, todayIso } from "@/lib/store";
import type { Comment, Draft, Fact, Finding, Term, User } from "@/lib/types";

const CHANNELS = ["Instagram", "Website", "Press note", "Email", "Other"];
const MAX_BODY = 4000;
const MAX_DRAFTS_PER_SESSION = 25;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (path: string, error: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);

async function loadDraft(id: string, sessionId: string): Promise<Draft> {
  const store = await db();
  const d = await store.get<Draft>("drafts", id);
  if (!d || d.session_id !== sessionId) notFound();
  return d;
}

// ---------------------------------------------------------------- sign-in (demo roles)

export async function loginAs(formData: FormData) {
  const user = USERS.find((u) => u.id === str(formData, "user_id"));
  if (!user) redirect("/");
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
  const existing = jar.get(SESSION_COOKIE)?.value;
  const sessionId = existing || crypto.randomUUID();
  jar.set(USER_COOKIE, user.id, opts);
  jar.set(SESSION_COOKIE, sessionId, opts);
  await audit(sessionId, user, "login", `Entered the demo as ${user.name} (${user.role}).`);
  redirect(homeFor(user.role));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(USER_COOKIE);
  redirect("/");
}

// ---------------------------------------------------------------- drafts

export async function createDraft(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const store = await db();
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const title = str(formData, "title").slice(0, 120) || "Untitled draft";
  const channelRaw = str(formData, "channel");
  const channel = CHANNELS.includes(channelRaw) ? channelRaw : "Other";
  if (body.length < 10) back("/drafts/new", "Write at least a sentence (10 characters) so there is something to check.");
  if (body.length > MAX_BODY) back("/drafts/new", `Keep the text under ${MAX_BODY} characters for this demo.`);
  if ((await store.count("drafts", { session_id: sessionId })) >= MAX_DRAFTS_PER_SESSION) {
    back("/drafts/new", "This demo session has reached its limit of 25 drafts.");
  }

  const now = nowIso();
  const draft: Draft = {
    id: newId("D-"),
    session_id: sessionId,
    title,
    channel,
    author_id: user.id,
    body,
    rev: 1,
    status: "draft",
    ai_used: false,
    created_at: now,
    updated_at: now,
  };
  await store.insert("drafts", draft as unknown as Record<string, unknown>);
  await store.insert("revisions", {
    id: newId("r-"),
    draft_id: draft.id,
    rev: 1,
    body,
    note: "First version",
    actor_name: user.name,
    created_at: now,
  });
  await audit(sessionId, user, "draft_created", `Created "${title}" for ${channel}.`, draft.id);
  await runCheck(draft, user);
  redirect(`/drafts/${draft.id}`);
}

/** Saves a new body as the next revision, then re-checks it. */
async function saveRevision(draft: Draft, body: string, note: string, actor: Pick<User, "name" | "role">) {
  const store = await db();
  const next: Draft = { ...draft, body, rev: draft.rev + 1, status: "draft", updated_at: nowIso() };
  await store.update("drafts", draft.id, { body, rev: next.rev, status: "draft", updated_at: next.updated_at });
  await store.insert("revisions", {
    id: newId("r-"),
    draft_id: draft.id,
    rev: next.rev,
    body,
    note,
    actor_name: actor.name,
    created_at: next.updated_at,
  });
  await audit(draft.session_id, actor, "draft_edited", `Revision ${next.rev}: ${note}`, draft.id);
  await runCheck(next, actor);
}

export async function editDraft(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (draft.status !== "draft" && draft.status !== "changes_requested") back(path, "This draft is locked while it is in review or approved.");
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < 10) back(path, "The text is too short to check.");
  if (body.length > MAX_BODY) back(path, `Keep the text under ${MAX_BODY} characters for this demo.`);
  if (body !== draft.body) await saveRevision(draft, body, "Edited by hand", user);
  revalidatePath(path);
  redirect(path);
}

export async function recheckDraft(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (draft.status !== "draft" && draft.status !== "changes_requested") back(path, "Only drafts that are still being worked on can be re-checked.");
  await runCheck(draft, user);
  revalidatePath(path);
  redirect(path);
}

export async function decideFinding(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const store = await db();
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (draft.status !== "draft" && draft.status !== "changes_requested") back(path, "This draft is locked while it is in review or approved.");
  const finding = await store.get<Finding>("findings", str(formData, "finding_id"));
  if (!finding || finding.draft_id !== draft.id) back(path, "That finding is no longer on this draft. Re-check the draft and try again.");
  const f = finding as Finding;
  const decision = str(formData, "decision");
  const note = str(formData, "note").slice(0, 300);

  if (decision === "dispute") {
    if (note.length < 5) back(path, "Add a short reason (at least 5 characters) so the reviewer can see why you disagree.");
    await store.update("findings", f.id, { decision: "disputed", decision_note: note, decided_by: user.name });
    await audit(sessionId, user, "finding_disputed", `${f.rule_id} "${f.quote}": ${note}`, draft.id);
  } else if (decision === "reopen") {
    await store.update("findings", f.id, { decision: "pending", decision_note: "", decided_by: "" });
    await audit(sessionId, user, "finding_reopened", `${f.rule_id} "${f.quote}"`, draft.id);
  } else if (decision === "confirm") {
    await store.update("findings", f.id, { decision: "accepted", decision_note: "Confirmed against the approved fact", decided_by: user.name });
    await audit(sessionId, user, "finding_confirmed", `${f.rule_id} "${f.quote}" matches ${f.source_ref}`, draft.id);
  } else if (decision === "accept") {
    if (f.fix_kind === "manual") back(path, "This one needs a manual edit. Change the text yourself, or dispute it with a reason.");
    const body = applyFix(draft.body, f);
    if (body === draft.body) back(path, "The suggested fix could not be applied because the wording is no longer in the draft.");
    if (body.length < 10) back(path, "Applying that fix would leave almost no text. Edit the draft by hand instead.");
    await audit(sessionId, user, "finding_accepted", `${f.rule_id} "${f.quote}" -> ${f.suggestion ? `"${f.suggestion}"` : "removed"}`, draft.id);
    await saveRevision(draft, body, `Accepted fix: ${f.rule_id} on "${f.quote}"`, user);
  } else {
    back(path, "Unknown action.");
  }
  revalidatePath(path);
  redirect(path);
}

export async function submitForReview(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const store = await db();
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (draft.status !== "draft" && draft.status !== "changes_requested") back(path, "This draft has already been sent.");
  const findings = await store.select<Finding>("findings", { draft_id: draft.id });
  const gate = canSubmit(findings);
  if (!gate.ok) back(path, gate.reason);
  await store.update("drafts", draft.id, { status: "in_review", updated_at: nowIso() });
  const disputed = findings.filter((f) => f.decision === "disputed").length;
  await audit(sessionId, user, "submitted", `Sent revision ${draft.rev} for review${disputed ? ` with ${disputed} disputed finding${disputed > 1 ? "s" : ""}` : ""}.`, draft.id);
  revalidatePath(path);
  redirect(path);
}

export async function reviewDecision(formData: FormData) {
  const { user, sessionId } = await requireUser(["reviewer"]);
  const store = await db();
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (draft.status !== "in_review") back(path, "This draft is not waiting for review.");
  const outcome = str(formData, "outcome");
  const comment = str(formData, "comment").slice(0, 500);
  const findings = await store.select<Finding>("findings", { draft_id: draft.id });
  if (outcome === "approve") {
    const disputed = findings.filter((f) => f.decision === "disputed").length;
    await store.update("drafts", draft.id, { status: "approved", updated_at: nowIso() });
    await audit(sessionId, user, "approved", `Approved revision ${draft.rev}${disputed ? ` after reviewing ${disputed} disputed finding${disputed > 1 ? "s" : ""}` : ""}.${comment ? ` Note: ${comment}` : ""}`, draft.id);
  } else if (outcome === "changes") {
    if (comment.length < 5) back(path, "Tell the author what to change (at least 5 characters).");
    await store.update("drafts", draft.id, { status: "changes_requested", updated_at: nowIso() });
    await audit(sessionId, user, "changes_requested", comment, draft.id);
  } else {
    back(path, "Unknown action.");
  }
  if (comment) {
    const c: Comment = {
      id: newId("c-"),
      draft_id: draft.id,
      author_name: user.name,
      author_role: user.role,
      body: comment,
      created_at: nowIso(),
    };
    await store.insert("comments", c as unknown as Record<string, unknown>);
  }
  revalidatePath(path);
  redirect(path);
}

export async function addComment(formData: FormData) {
  const { user, sessionId } = await requireUser();
  const store = await db();
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const body = str(formData, "body").slice(0, 500);
  if (body.length < 2) back(`/drafts/${draft.id}`, "Write a comment first.");
  const c: Comment = {
    id: newId("c-"),
    draft_id: draft.id,
    author_name: user.name,
    author_role: user.role,
    body,
    created_at: nowIso(),
  };
  await store.insert("comments", c as unknown as Record<string, unknown>);
  await audit(sessionId, user, "comment", body, draft.id);
  revalidatePath(`/drafts/${draft.id}`);
  redirect(`/drafts/${draft.id}`);
}

// ---------------------------------------------------------------- knowledge base (admin only)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function addFact(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  const store = await db();
  const statement = str(formData, "statement").slice(0, 300);
  const source = str(formData, "source").slice(0, 200);
  const owner = str(formData, "owner").slice(0, 100) || "Brand team";
  const expires = str(formData, "expires_on");
  const keywords = str(formData, "keywords").slice(0, 200);
  if (!statement || !source) back("/knowledge", "A fact needs a statement and a source.");
  if (!DATE_RE.test(expires)) back("/knowledge", "Choose an expiry date.");
  const facts = await store.select<Fact>("facts");
  const next = Math.max(0, ...facts.map((f) => Number(f.id.replace(/\D/g, "")) || 0)) + 1;
  const id = `F-${String(next).padStart(2, "0")}`;
  await store.insert("facts", { id, statement, source, owner, expires_on: expires, keywords });
  await audit(sessionId, user, "fact_added", `${id}: ${statement} (until ${expires})`);
  revalidatePath("/knowledge");
  redirect("/knowledge");
}

export async function setFactExpiry(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  const store = await db();
  const id = str(formData, "fact_id");
  const expires = str(formData, "expires_on");
  if (!DATE_RE.test(expires)) back("/knowledge", "Choose a valid date.");
  const fact = await store.get<Fact>("facts", id);
  if (!fact) back("/knowledge", "That fact no longer exists.");
  await store.update("facts", id, { expires_on: expires });
  await audit(sessionId, user, "fact_expiry_changed", `${id}: ${(fact as Fact).expires_on} -> ${expires}`);
  revalidatePath("/knowledge");
  redirect("/knowledge");
}

export async function addTerm(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  const store = await db();
  const term = str(formData, "term").slice(0, 60);
  const replacement = str(formData, "replacement").slice(0, 60);
  const reason = str(formData, "reason").slice(0, 200) || "Not an approved term.";
  if (!term) back("/knowledge", "Enter the word or phrase to avoid.");
  const terms = await store.select<Term>("terms");
  const next = Math.max(0, ...terms.map((t) => Number(t.id.replace(/\D/g, "")) || 0)) + 1;
  const id = `T-${String(next).padStart(2, "0")}`;
  await store.insert("terms", { id, term, kind: "banned", replacement, reason, guideline_ref: "G-1" });
  await audit(sessionId, user, "term_added", `${id}: "${term}" -> "${replacement || "(remove)"}"`);
  revalidatePath("/knowledge");
  redirect("/knowledge");
}

export async function resetKnowledge() {
  const { user, sessionId } = await requireUser(["admin"]);
  await resetKnowledgeBase();
  await audit(sessionId, user, "knowledge_reset", `Restored the demo guidelines, facts and terms on ${todayIso()}.`);
  revalidatePath("/knowledge");
  redirect("/knowledge");
}
