"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { reserveAiCall } from "@/lib/aicap";
import { audit } from "@/lib/audit";
import { MAX_CSV_BYTES, parseFactsCsv } from "@/lib/csv";
import { runCheck } from "@/lib/check";
import { ingestFile, MAX_DOC_TEXT, MAX_FILE_BYTES, sniff, type Ingested } from "@/lib/extract";
import { loadKnowledge } from "@/lib/knowledge";
import { recordLedger, sweepWorkspace, type SweepResult } from "@/lib/ledger";
import { purgeSession } from "@/lib/purge";
import { applyFix } from "@/lib/rules";
import { SAMPLE_FILES } from "@/lib/sample-files";
import { DEMO_LOGINS, USERS } from "@/lib/seed";
import { SESSION_COOKIE, USER_COOKIE, homeFor, requireUser } from "@/lib/session";
import { canSubmit, isEditable } from "@/lib/status";
import { db, ensureWorkspace, newId, nowIso, resetWorkspace, todayIso } from "@/lib/store";
import type { Comment, Draft, DraftFile, Fact, Finding, Term, User } from "@/lib/types";

const CHANNELS = ["Instagram", "Website", "Press note", "Email", "Other"];
const MAX_BODY = 4000;
const MAX_DRAFTS_PER_SESSION = 25;
const MAX_FILES_PER_SESSION = 8;
const FILE_KEEP_DAYS = 3;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const withParam = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
const back = (path: string, error: string): never => redirect(withParam(path, "error", error));
/** Goes to a page with a calm information banner (used when an action was already done, e.g. a double click). */
const note = (path: string, message: string): never => redirect(withParam(path, "notice", message));
const cleanBody = (s: string) => s.replace(/\r\n/g, "\n").trim();

async function loadDraft(id: string, sessionId: string): Promise<Draft> {
  const store = await db();
  const d = await store.get<Draft>("drafts", id);
  if (!d || d.session_id !== sessionId) notFound();
  return d;
}

function reflagNotice(r: SweepResult): string {
  const parts: string[] = [];
  if (r.reflagged.length) parts.push(`${r.reflagged.length} approved piece${r.reflagged.length === 1 ? "" : "s"} re-flagged for re-review: ${r.reflagged.map((d) => `“${d.title}”`).join(", ")}.`);
  if (r.cleared.length) parts.push(`${r.cleared.length} piece${r.cleared.length === 1 ? " is" : "s are"} approved again because the evidence is back in date.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------- sign-in (demo roles)

async function startSession(user: User): Promise<never> {
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
  await ensureWorkspace(sessionId);
  await audit(sessionId, user, "login", `Entered the demo as ${user.name} (${user.role}).`);
  return redirect(homeFor(user.role));
}

/** One-click entry (role cards on the home page and the "Switch to" buttons). */
export async function loginAs(formData: FormData) {
  const user = USERS.find((u) => u.id === str(formData, "user_id"));
  if (!user) redirect("/");
  await startSession(user);
}

/** Email and password sign-in with the public demo credentials shown on the home page. */
export async function signIn(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/?error=" + encodeURIComponent("Enter an email and a password, or use one of the demo accounts shown on this page.") + "#signin");
  const user = USERS.find((u) => DEMO_LOGINS[u.id]?.email === email && DEMO_LOGINS[u.id]?.password === password);
  if (!user) redirect("/?error=" + encodeURIComponent("That email and password do not match a demo account. Copy one of the pairs shown above the form.") + "#signin");
  await startSession(user as User);
}

export async function logout() {
  const jar = await cookies();
  jar.delete(USER_COOKIE);
  redirect("/");
}

/** Privacy: deletes everything this visitor created (drafts, uploaded files, ledger, history, their own facts) and signs out. */
export async function deleteMyData() {
  const { sessionId } = await requireUser();
  await purgeSession(sessionId);
  const jar = await cookies();
  jar.delete(USER_COOKIE);
  jar.delete(SESSION_COOKIE);
  redirect("/?notice=" + encodeURIComponent("All of your drafts, files and settings were deleted."));
}

// ---------------------------------------------------------------- drafts

async function assertRoom(sessionId: string, path: string, files = false) {
  const store = await db();
  if ((await store.count("drafts", { session_id: sessionId, is_sample: false })) >= MAX_DRAFTS_PER_SESSION) {
    back(path, `This demo session has reached its limit of ${MAX_DRAFTS_PER_SESSION} drafts. Use “Delete my data” in the footer to start fresh.`);
  }
  if (files && (await store.count("draft_files", { session_id: sessionId })) >= MAX_FILES_PER_SESSION) {
    back(path, `This demo session has reached its limit of ${MAX_FILES_PER_SESSION} uploaded files. Use “Delete my data” in the footer to start fresh.`);
  }
}

export async function createDraft(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  await ensureWorkspace(sessionId);
  const store = await db();
  const body = cleanBody(String(formData.get("body") ?? ""));
  const title = str(formData, "title").slice(0, 120) || "Untitled draft";
  const channelRaw = str(formData, "channel");
  const channel = CHANNELS.includes(channelRaw) ? channelRaw : "Other";
  if (body.length < 10) back("/drafts/new", "Write at least a sentence (10 characters) so there is something to check.");
  if (body.length > MAX_BODY) back("/drafts/new", `Keep the text under ${MAX_BODY} characters, or upload it as a file (up to ${MAX_DOC_TEXT.toLocaleString("en-IN")} characters are checked).`);
  await assertRoom(sessionId, "/drafts/new");

  const now = nowIso();
  const draft = newDraft({ sessionId, user, title, channel, body, now });
  await store.insert("drafts", draft as unknown as Record<string, unknown>);
  await store.insert("revisions", { id: newId("r-"), draft_id: draft.id, rev: 1, body, note: "First version", actor_name: user.name, created_at: now });
  await audit(sessionId, user, "draft_created", `Created "${title}" for ${channel}.`, draft.id);
  await runCheck(draft, user);
  redirect(`/drafts/${draft.id}`);
}

function newDraft(a: { sessionId: string; user: User; title: string; channel: string; body: string; now: string } & Partial<Draft>): Draft {
  const { sessionId, user, title, channel, body, now, ...extra } = a;
  return {
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
    source_type: "text",
    source_name: "",
    alt_text: "",
    extract_note: "",
    visual: "",
    is_sample: false,
    submitted_at: "",
    approved_at: "",
    approved_by: "",
    ...extra,
  };
}

/** Saves a new body as the next revision, then re-checks it. */
async function saveRevision(draft: Draft, body: string, revNote: string, actor: Pick<User, "name" | "role">, extra: Partial<Draft> = {}) {
  const store = await db();
  const updated_at = nowIso();
  const next: Draft = { ...draft, ...extra, body, rev: draft.rev + 1, status: "draft", updated_at };
  await store.update("drafts", draft.id, { ...extra, body, rev: next.rev, status: "draft", updated_at });
  await store.insert("revisions", { id: newId("r-"), draft_id: draft.id, rev: next.rev, body, note: revNote, actor_name: actor.name, created_at: updated_at });
  await audit(draft.session_id, actor, "draft_edited", `Revision ${next.rev}: ${revNote}`, draft.id);
  await runCheck(next, actor);
}

export async function editDraft(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (!isEditable(draft.status)) back(path, "This draft is locked while it is in review or approved.");
  const body = cleanBody(String(formData.get("body") ?? ""));
  const isFile = draft.source_type !== "text";
  const max = isFile ? MAX_DOC_TEXT : MAX_BODY;
  const min = draft.source_type === "image" ? 0 : 10;
  if (body.length < min) back(path, "The text is too short to check.");
  if (body.length > max) back(path, `Keep the text under ${max.toLocaleString("en-IN")} characters.`);
  if (body !== draft.body) await saveRevision(draft, body, "Edited by hand", user);
  revalidatePath(path);
  redirect(path);
}

export async function recheckDraft(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (!isEditable(draft.status)) back(path, "Only drafts that are still being worked on can be re-checked.");
  await runCheck(draft, user);
  revalidatePath(path);
  redirect(path);
}

// ---------------------------------------------------------------- uploaded files (Word, PDF, images)

type UploadOutcome = { error: string } | { draft: Draft };

/** Reads a file into a new draft (revision 1) and runs the first check. Shared by the file picker and the sample files. */
async function createFromFile(args: { user: User; sessionId: string; buf: Buffer; name: string; title: string; channel: string; alt: string }): Promise<UploadOutcome> {
  const { user, sessionId, buf, name } = args;
  const store = await db();
  if (buf.length > MAX_FILE_BYTES) return { error: `That file is ${(buf.length / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB. Compress it or paste the text instead.` };
  const sniffed = sniff(buf, name);
  if ("error" in sniffed) return { error: sniffed.error };
  let ing: Ingested;
  try {
    ing = await ingestFile({ buf, name, sniffed, reserveAi: () => reserveAiCall(sessionId, user, `Reading uploaded ${sniffed.kind} "${name.slice(0, 60)}"`) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That file could not be read." };
  }
  if (ing.kind !== "image" && ing.text.replace(/\s/g, "").length < 10) {
    return { error: "No readable text was found in that file. If it is a scan or a picture of text, upload it as an image, or paste the text." };
  }

  const now = nowIso();
  const isTextFile = ing.kind === "text";
  const draft = newDraft({
    sessionId,
    user,
    title: args.title,
    channel: args.channel,
    body: ing.text,
    now,
    source_type: ing.kind,
    source_name: name.slice(0, 120),
    alt_text: ing.kind === "image" ? args.alt : "",
    extract_note: ing.note,
    visual: ing.visual ? JSON.stringify(ing.visual) : "",
  });
  await store.insert("drafts", draft as unknown as Record<string, unknown>);
  await store.insert("revisions", { id: newId("r-"), draft_id: draft.id, rev: 1, body: ing.text, note: `First version (uploaded ${name.slice(0, 60)})`, actor_name: user.name, created_at: now });
  if (!isTextFile) {
    const file: DraftFile = { id: newId("x-"), draft_id: draft.id, session_id: sessionId, name: name.slice(0, 120), mime: sniffed.mime, size: buf.length, data: buf.toString("base64"), created_at: now };
    await store.insert("draft_files", file as unknown as Record<string, unknown>);
    // keep storage small: originals are removed after a few days
    const cutoff = new Date(Date.now() - FILE_KEEP_DAYS * 86_400_000).toISOString();
    await store.deleteBefore("draft_files", "created_at", cutoff).catch(() => undefined);
  }
  await audit(sessionId, user, "draft_created", `Uploaded "${name.slice(0, 60)}" (${ing.kind}, ${(buf.length / 1024).toFixed(0)} KB). ${ing.note}`, draft.id);
  await runCheck(draft, user);
  return { draft };
}

const fileOf = (fd: FormData): File | null => {
  const f = fd.get("file");
  return f && typeof f === "object" && "arrayBuffer" in f && "name" in f ? (f as File) : null;
};
const baseName = (n: string) => n.replace(/\.[^.]+$/, "").slice(0, 120) || "Uploaded file";

export async function createDraftFromFile(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  await ensureWorkspace(sessionId);
  const path = "/drafts/new?tab=file";
  await assertRoom(sessionId, path, true);
  const file = fileOf(formData);
  if (!file || file.size === 0) back(path, file ? "That file is empty. Choose a file with some content." : "Choose a file to upload first.");
  const f = file as File;
  if (f.size > MAX_FILE_BYTES) back(path, `That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB. Compress it or paste the text instead.`);
  const channelRaw = str(formData, "channel");
  const out = await createFromFile({
    user,
    sessionId,
    buf: Buffer.from(await f.arrayBuffer()),
    name: f.name || "upload",
    title: str(formData, "title").slice(0, 120) || baseName(f.name),
    channel: CHANNELS.includes(channelRaw) ? channelRaw : "Other",
    alt: str(formData, "alt").slice(0, 300),
  });
  if ("error" in out) back(path, out.error);
  redirect(`/drafts/${(out as { draft: Draft }).draft.id}`);
}

export async function createDraftFromSample(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  await ensureWorkspace(sessionId);
  const path = "/drafts/new?tab=file";
  await assertRoom(sessionId, path, true);
  const s = SAMPLE_FILES.find((x) => x.id === str(formData, "sample_id"));
  if (!s) back(path, "That sample file does not exist.");
  const sample = s as (typeof SAMPLE_FILES)[number];
  const out = await createFromFile({ user, sessionId, buf: Buffer.from(sample.base64, "base64"), name: sample.name, title: sample.title, channel: sample.channel, alt: "" });
  if ("error" in out) back(path, out.error);
  redirect(`/drafts/${(out as { draft: Draft }).draft.id}`);
}

/** Replaces the file of a draft with a corrected one. Creates a new revision. */
export async function replaceFile(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (!isEditable(draft.status)) back(path, "This draft is locked while it is in review or approved.");
  const file = fileOf(formData);
  if (!file || file.size === 0) back(path, file ? "That file is empty. Choose a file with some content." : "Choose a corrected file first.");
  const f = file as File;
  const buf = Buffer.from(await f.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) back(path, `That file is ${(buf.length / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB.`);
  const sniffed = sniff(buf, f.name);
  if ("error" in sniffed) back(path, sniffed.error);
  const kind = (sniffed as { kind: string }).kind;
  if (kind === "text") back(path, "Upload a Word, PDF or image file here. To change plain text, use “Edit the text yourself”.");
  let ing: Ingested;
  try {
    ing = await ingestFile({
      buf,
      name: f.name,
      sniffed: sniffed as { kind: Draft["source_type"]; mime: string },
      reserveAi: () => reserveAiCall(sessionId, user, `Reading new version "${f.name.slice(0, 60)}"`, draft.id),
    });
  } catch (e) {
    return back(path, e instanceof Error ? e.message : "That file could not be read.");
  }
  if (ing.kind !== "image" && ing.text.replace(/\s/g, "").length < 10) back(path, "No readable text was found in that file.");

  const store = await db();
  await store.deleteWhere("draft_files", { draft_id: draft.id });
  const now = nowIso();
  const stored: DraftFile = { id: newId("x-"), draft_id: draft.id, session_id: sessionId, name: f.name.slice(0, 120), mime: (sniffed as { mime: string }).mime, size: buf.length, data: buf.toString("base64"), created_at: now };
  await store.insert("draft_files", stored as unknown as Record<string, unknown>);
  await saveRevision(draft, ing.text, `Uploaded a new version: ${f.name.slice(0, 60)}`, user, {
    source_type: ing.kind,
    source_name: f.name.slice(0, 120),
    extract_note: ing.note,
    visual: ing.visual ? JSON.stringify(ing.visual) : "",
    alt_text: ing.kind === "image" ? draft.alt_text : "",
  });
  revalidatePath(path);
  redirect(path);
}

/** Reads the stored file again (useful when the AI reader was busy the first time). */
export async function rereadFile(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (!isEditable(draft.status)) back(path, "This draft is locked while it is in review or approved.");
  const store = await db();
  const file = await store.getWhere<DraftFile>("draft_files", { draft_id: draft.id });
  if (!file) back(path, "The original file is no longer stored (files are kept for 3 days). Upload it again with “Upload a new version”.");
  const stored = file as DraftFile;
  const buf = Buffer.from(stored.data, "base64");
  const sniffed = sniff(buf, stored.name);
  if ("error" in sniffed) back(path, (sniffed as { error: string }).error);
  let ing: Ingested;
  try {
    ing = await ingestFile({
      buf,
      name: stored.name,
      sniffed: sniffed as { kind: Draft["source_type"]; mime: string },
      reserveAi: () => reserveAiCall(sessionId, user, `Reading "${stored.name.slice(0, 60)}" again`, draft.id),
    });
  } catch (e) {
    return back(path, e instanceof Error ? e.message : "That file could not be read.");
  }
  const extra = { extract_note: ing.note, visual: ing.visual ? JSON.stringify(ing.visual) : "" };
  if (ing.text && ing.text !== draft.body) {
    await saveRevision(draft, ing.text, "Read the file again", user, extra);
  } else {
    await store.update("drafts", draft.id, extra);
    await runCheck({ ...draft, ...extra }, user);
  }
  revalidatePath(path);
  redirect(path);
}

export async function setAltText(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (draft.source_type !== "image") back(path, "Alt text applies to images only.");
  if (!isEditable(draft.status)) back(path, "This draft is locked while it is in review or approved.");
  const alt = str(formData, "alt").slice(0, 300);
  if (alt !== draft.alt_text) {
    const store = await db();
    await store.update("drafts", draft.id, { alt_text: alt, updated_at: nowIso() });
    await audit(sessionId, user, "alt_text_set", alt ? `Alt text: ${alt}` : "Alt text cleared", draft.id);
    await runCheck({ ...draft, alt_text: alt }, user);
  }
  revalidatePath(path);
  redirect(path);
}

// ---------------------------------------------------------------- findings and review

export async function decideFinding(formData: FormData) {
  const { user, sessionId } = await requireUser(["creator"]);
  const store = await db();
  const draft = await loadDraft(str(formData, "draft_id"), sessionId);
  const path = `/drafts/${draft.id}`;
  if (!isEditable(draft.status)) back(path, "This draft is locked while it is in review or approved.");
  const finding = await store.get<Finding>("findings", str(formData, "finding_id"));
  if (!finding || finding.draft_id !== draft.id) note(path, "That finding was already handled. The list below is up to date.");
  const f = finding as Finding;
  const decision = str(formData, "decision");
  const reason = str(formData, "note").slice(0, 300);

  if (decision === "dispute") {
    if (reason.length < 5) back(path, "Add a short reason (at least 5 characters) so the reviewer can see why you disagree.");
    await store.update("findings", f.id, { decision: "disputed", decision_note: reason, decided_by: user.name });
    await audit(sessionId, user, "finding_disputed", `${f.rule_id} "${f.quote}": ${reason}`, draft.id);
  } else if (decision === "reopen") {
    await store.update("findings", f.id, { decision: "pending", decision_note: "", decided_by: "" });
    await audit(sessionId, user, "finding_reopened", `${f.rule_id} "${f.quote}"`, draft.id);
  } else if (decision === "confirm") {
    await store.update("findings", f.id, { decision: "accepted", decision_note: "Confirmed against the approved fact", decided_by: user.name });
    await audit(sessionId, user, "finding_confirmed", `${f.rule_id} "${f.quote}" matches ${f.source_ref}`, draft.id);
  } else if (decision === "accept") {
    if (f.fix_kind === "manual") back(path, f.target === "body" ? "This one needs a manual edit. Change the text yourself, or dispute it with a reason." : "This one can't be fixed in the text. Change the alt text or the file, or dispute it with a reason.");
    const body = applyFix(draft.body, f);
    if (body === draft.body) back(path, "The suggested fix could not be applied because the wording is no longer in the draft.");
    if (body.length < 10 && draft.source_type !== "image") back(path, "Applying that fix would leave almost no text. Edit the draft by hand instead.");
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
  if (draft.status === "in_review" || draft.status === "approved") note(path, "This draft was already sent for review.");
  if (!isEditable(draft.status)) back(path, "This draft cannot be sent right now.");
  const findings = await store.select<Finding>("findings", { draft_id: draft.id });
  const gate = canSubmit(findings);
  if (!gate.ok) back(path, gate.reason);
  const now = nowIso();
  await store.update("drafts", draft.id, { status: "in_review", updated_at: now, submitted_at: now });
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
  const outcome = str(formData, "outcome");
  if (draft.status === "approved" && outcome === "approve") note(path, "This draft was already approved.");
  if (draft.status !== "in_review") note(path, "This draft is no longer waiting for review.");
  const comment = str(formData, "comment").slice(0, 500);
  const findings = await store.select<Finding>("findings", { draft_id: draft.id });
  if (outcome === "approve") {
    const disputed = findings.filter((f) => f.decision === "disputed").length;
    const now = nowIso();
    const { facts } = await loadKnowledge(sessionId);
    await store.update("drafts", draft.id, { status: "approved", updated_at: now, approved_at: now, approved_by: user.name });
    const entries = await recordLedger({ draft, findings, facts, approver: user.name, at: now });
    await audit(sessionId, user, "approved", `Approved revision ${draft.rev}${disputed ? ` after reviewing ${disputed} disputed finding${disputed > 1 ? "s" : ""}` : ""}. ${entries} ledger entr${entries === 1 ? "y" : "ies"} recorded.${comment ? ` Note: ${comment}` : ""}`, draft.id);
  } else if (outcome === "changes") {
    if (comment.length < 5) back(path, "Tell the author what to change (at least 5 characters).");
    await store.update("drafts", draft.id, { status: "changes_requested", updated_at: nowIso() });
    await audit(sessionId, user, "changes_requested", comment, draft.id);
  } else {
    back(path, "Unknown action.");
  }
  if (comment) {
    const c: Comment = { id: newId("c-"), draft_id: draft.id, author_name: user.name, author_role: user.role, body: comment, created_at: nowIso() };
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
  const c: Comment = { id: newId("c-"), draft_id: draft.id, author_name: user.name, author_role: user.role, body, created_at: nowIso() };
  await store.insert("comments", c as unknown as Record<string, unknown>);
  await audit(sessionId, user, "comment", body, draft.id);
  revalidatePath(`/drafts/${draft.id}`);
  redirect(`/drafts/${draft.id}`);
}

// ---------------------------------------------------------------- knowledge base (admin only)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(new Date(s).getTime());

/** Runs after any fact change: re-flags approved pieces whose evidence is no longer valid. */
async function afterFactChange(sessionId: string, summary: string): Promise<never> {
  const swept = await sweepWorkspace(sessionId);
  revalidatePath("/knowledge");
  revalidatePath("/ledger");
  const extra = reflagNotice(swept);
  return note("/knowledge", extra ? `${summary} ${extra}` : summary);
}

export async function addFact(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  await ensureWorkspace(sessionId);
  const store = await db();
  const statement = str(formData, "statement").slice(0, 300);
  const source = str(formData, "source").slice(0, 200);
  const owner = str(formData, "owner").slice(0, 100) || "Brand team";
  const expires = str(formData, "expires_on");
  const keywords = str(formData, "keywords").slice(0, 200);
  if (!statement || !source) back("/knowledge", "A fact needs a statement and a source.");
  if (!validDate(expires)) back("/knowledge", "Choose an expiry date.");
  const facts = await store.select<Fact>("facts", { ws: sessionId });
  const next = Math.max(0, ...facts.map((f) => Number(f.id.replace(/\D/g, "")) || 0)) + 1;
  const id = `F-${String(next).padStart(2, "0")}`;
  await store.insert("facts", { ws: sessionId, id, statement, source, owner, expires_on: expires, keywords });
  await audit(sessionId, user, "fact_added", `${id}: ${statement} (until ${expires})`);
  return afterFactChange(sessionId, `Added ${id}.`);
}

/** Adds many approved facts from a CSV file (admin only). Bad rows are skipped with a reason; nothing is half-saved. */
export async function importFacts(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  await ensureWorkspace(sessionId);
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) back("/knowledge", "Choose a CSV file first.");
  const file = f as File;
  if (file.size > MAX_CSV_BYTES) back("/knowledge", `That file is ${Math.round(file.size / 1024)} KB. The limit is ${MAX_CSV_BYTES / 1024} KB.`);
  const store = await db();
  const facts = await store.select<Fact>("facts", { ws: sessionId });
  const parsed = parseFactsCsv(await file.text(), facts);
  if (!parsed.ok) back("/knowledge", parsed.error);
  const { rows, problems } = parsed as Extract<typeof parsed, { ok: true }>;
  const why = problems.slice(0, 3).map((p) => p.slice(0, 110)).join(" ") + (problems.length > 3 ? ` (${problems.length - 3} more)` : "");
  if (rows.length === 0) back("/knowledge", `Nothing was imported. ${why}`.trim());
  let next = Math.max(0, ...facts.map((x) => Number(x.id.replace(/\D/g, "")) || 0)) + 1;
  const created = rows.map((r) => ({ ws: sessionId, id: `F-${String(next++).padStart(2, "0")}`, ...r }));
  await store.insert("facts", created);
  await audit(sessionId, user, "facts_imported", `${created.length} facts from CSV (${created[0].id} to ${created[created.length - 1].id})${problems.length ? `, ${problems.length} rows skipped` : ""}`);
  return afterFactChange(sessionId, `Imported ${created.length} fact${created.length === 1 ? "" : "s"} (${created[0].id} to ${created[created.length - 1].id}).${problems.length ? ` Skipped ${problems.length}: ${why}` : ""}`);
}

export async function setFactExpiry(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  const store = await db();
  const id = str(formData, "fact_id");
  const expires = str(formData, "expires_on");
  if (!validDate(expires)) back("/knowledge", "Choose a valid date.");
  const fact = await store.getWhere<Fact>("facts", { ws: sessionId, id });
  if (!fact) back("/knowledge", "That fact no longer exists.");
  const old = (fact as Fact).expires_on;
  if (old === expires) note("/knowledge", `${id} already expires on ${expires}.`);
  await store.updateWhere("facts", { ws: sessionId, id }, { expires_on: expires });
  await audit(sessionId, user, "fact_expiry_changed", `${id}: ${old} -> ${expires}`);
  return afterFactChange(sessionId, `${id} now expires on ${expires}.`);
}

export async function editFact(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  const store = await db();
  const id = str(formData, "fact_id");
  const statement = str(formData, "statement").slice(0, 300);
  const source = str(formData, "source").slice(0, 200);
  const owner = str(formData, "owner").slice(0, 100) || "Brand team";
  const keywords = str(formData, "keywords").slice(0, 200);
  if (!statement || !source) back("/knowledge", "A fact needs a statement and a source.");
  const fact = await store.getWhere<Fact>("facts", { ws: sessionId, id });
  if (!fact) back("/knowledge", "That fact no longer exists.");
  const old = fact as Fact;
  if (old.statement === statement && old.source === source && old.owner === owner && old.keywords === keywords) note("/knowledge", `No change to ${id}.`);
  await store.updateWhere("facts", { ws: sessionId, id }, { statement, source, owner, keywords });
  await audit(sessionId, user, "fact_edited", `${id}: "${old.statement}" -> "${statement}"`);
  return afterFactChange(sessionId, `${id} was updated.`);
}

export async function deleteFact(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  const store = await db();
  const id = str(formData, "fact_id");
  const fact = await store.getWhere<Fact>("facts", { ws: sessionId, id });
  if (!fact) note("/knowledge", `${id} was already removed.`);
  await store.deleteWhere("facts", { ws: sessionId, id });
  await audit(sessionId, user, "fact_removed", `${id}: ${(fact as Fact).statement}`);
  return afterFactChange(sessionId, `${id} was removed.`);
}

export async function addTerm(formData: FormData) {
  const { user, sessionId } = await requireUser(["admin"]);
  await ensureWorkspace(sessionId);
  const store = await db();
  const term = str(formData, "term").slice(0, 60);
  const replacement = str(formData, "replacement").slice(0, 60);
  const reason = str(formData, "reason").slice(0, 200) || "Not an approved term.";
  if (!term) back("/knowledge", "Enter the word or phrase to avoid.");
  if (!/[\p{L}\p{N}]/u.test(term)) back("/knowledge", "The term needs at least one letter or number.");
  const terms = await store.select<Term>("terms", { ws: sessionId });
  if (terms.some((t) => t.term.toLowerCase() === term.toLowerCase())) note("/knowledge", `“${term}” is already on the list.`);
  const next = Math.max(0, ...terms.map((t) => Number(t.id.replace(/\D/g, "")) || 0)) + 1;
  const id = `T-${String(next).padStart(2, "0")}`;
  await store.insert("terms", { ws: sessionId, id, term, kind: "banned", replacement, reason, guideline_ref: "G-1" });
  await audit(sessionId, user, "term_added", `${id}: "${term}" -> "${replacement || "(remove)"}"`);
  revalidatePath("/knowledge");
  note("/knowledge", `Added “${term}” to the terms to avoid.`);
}

export async function resetKnowledge() {
  const { user, sessionId } = await requireUser(["admin"]);
  await resetWorkspace(sessionId);
  await audit(sessionId, user, "knowledge_reset", `Restored the demo guidelines, facts and terms on ${todayIso()}.`);
  return afterFactChange(sessionId, "Restored the original demo guidelines, facts and terms.");
}
