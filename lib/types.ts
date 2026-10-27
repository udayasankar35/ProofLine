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

export type DraftStatus = "draft" | "in_review" | "changes_requested" | "approved";

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
export type Origin = "rule" | "fallback" | "ai";

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
