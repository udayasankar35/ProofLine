export type Role = "creator" | "reviewer" | "admin";

export interface User {
  id: string;
  name: string;
  role: Role;
  title: string;
}

export interface Guideline {
  id: string;
  title: string;
  text: string;
}

export interface Fact {
  id: string;
  statement: string;
  source: string;
  owner: string;
  expires_on: string; // YYYY-MM-DD
  keywords: string; // comma separated, used by the rules-only matcher
}

export interface Term {
  id: string;
  term: string;
  kind: "banned" | "preferred";
  replacement: string;
  reason: string;
  guideline_ref: string;
}

export interface Disclaimer {
  id: string;
  triggers: string; // comma separated
  text: string;
}

export type DraftStatus = "draft" | "in_review" | "changes_requested" | "approved" | "reflagged";
export type SourceType = "text" | "docx" | "pdf" | "image";

export interface Draft {
  id: string;
  session_id: string;
  title: string;
  channel: string;
  author_id: string;
  body: string;
  rev: number;
  status: DraftStatus;
  ai_used: boolean;
  created_at: string;
  updated_at: string;
  source_type: SourceType;
  source_name: string;
  alt_text: string;
  extract_note: string; // how the text was read from an uploaded file, and anything that could not be read
  visual: string; // JSON of VisualInfo, or ""
  is_sample: boolean;
  submitted_at: string;
  approved_at: string;
  approved_by: string;
}

/** What was read from an uploaded file besides its text (stored as JSON in drafts.visual). */
export interface VisualInfo {
  kind: "image" | "pdf" | "docx";
  ai: boolean; // the vision model looked at the file
  model?: string;
  text_blocks?: Array<{ text: string; height_pct: number; fg: string; bg: string }>;
  colors?: string[];
  suggested_alt?: string;
  docx_images?: Array<{ name: string; alt: string; decorative: boolean }>;
}

export interface DraftFile {
  id: string;
  draft_id: string;
  session_id: string;
  name: string;
  mime: string;
  size: number;
  data: string; // base64
  created_at: string;
}

export interface Revision {
  id: string;
  draft_id: string;
  rev: number;
  body: string;
  note: string;
  actor_name: string;
  created_at: string;
}

export type Verdict = "supported" | "unsupported" | "outdated" | "rule" | "tone";
export type FixKind = "replace" | "remove" | "append" | "manual";
export type Decision = "pending" | "accepted" | "disputed";
export type Severity = "high" | "medium" | "low";
export type Origin = "rule" | "fallback" | "ai" | "vision";
export type Confidence = "high" | "medium" | "low";
export type Target = "body" | "alt" | "visual";

export interface Finding {
  id: string;
  draft_id: string;
  rev: number;
  rule_id: string;
  severity: Severity;
  verdict: Verdict;
  title: string;
  quote: string;
  reason: string;
  source_ref: string;
  source_text: string;
  fix_kind: FixKind;
  suggestion: string;
  origin: Origin;
  decision: Decision;
  decision_note: string;
  decided_by: string;
  created_at: string;
  confidence: Confidence;
  target: Target;
}

export interface Comment {
  id: string;
  draft_id: string;
  author_name: string;
  author_role: Role;
  body: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  session_id: string;
  draft_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  detail: string;
  created_at: string;
}

export type LedgerStatus = "ok" | "expired" | "changed" | "removed" | "exception";

/** One claim in an approved piece, the approved fact behind it (as it was at approval), and who approved it. */
export interface LedgerEntry {
  id: string;
  session_id: string;
  draft_id: string;
  rev: number;
  claim: string;
  kind: string;
  basis: string; // how the match was made: "AI match, code-verified", "Keyword match", "Reviewer exception"
  fact_id: string;
  fact_statement: string;
  fact_source: string;
  fact_owner: string;
  fact_expires_on: string;
  verdict: string;
  note: string;
  approved_by: string;
  approved_at: string;
  status: LedgerStatus;
  status_note: string;
  checked_at: string;
}

export interface FindingEvent {
  id: string;
  session_id: string;
  draft_id: string;
  rev: number;
  rule_id: string;
  severity: Severity;
  verdict: Verdict;
  origin: Origin;
  created_at: string;
}

export interface EvalRun {
  id: string;
  kind: "rules" | "ai";
  model: string;
  session_id: string;
  started_at: string;
  finished_at: string;
  status: "running" | "done" | "failed";
  total: number;
  done: number;
  metrics: string; // JSON
  details: string; // JSON
}

export interface Feedback {
  id: string;
  session_id: string;
  role: string;
  completed: string;
  ease: number;
  confusing: string;
  wanted: string;
  created_at: string;
}
