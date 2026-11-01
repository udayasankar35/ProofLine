-- ProofLine Round 3 migration.
-- Paste this whole file into Supabase > SQL Editor > New query > Run. It is safe to run more than once.
-- It adds: per-session guidelines and facts, document and image uploads, the evidence ledger,
-- governance insights data, the evaluation runs table and the tester feedback table.

-- 1. Every visitor session gets its own copy of guidelines, facts, terms and disclaimers ("ws" = workspace = session id).
alter table guidelines  add column if not exists ws text not null default 'seed';
alter table facts       add column if not exists ws text not null default 'seed';
alter table terms       add column if not exists ws text not null default 'seed';
alter table disclaimers add column if not exists ws text not null default 'seed';
alter table guidelines  drop constraint if exists guidelines_pkey;
alter table facts       drop constraint if exists facts_pkey;
alter table terms       drop constraint if exists terms_pkey;
alter table disclaimers drop constraint if exists disclaimers_pkey;
alter table guidelines  add primary key (ws, id);
alter table facts       add primary key (ws, id);
alter table terms       add primary key (ws, id);
alter table disclaimers add primary key (ws, id);

-- 2. Drafts: uploaded files, alt text, visual analysis, approval times, sample-history flag.
alter table drafts add column if not exists source_type text not null default 'text';
alter table drafts add column if not exists source_name text not null default '';
alter table drafts add column if not exists alt_text text not null default '';
alter table drafts add column if not exists extract_note text not null default '';
alter table drafts add column if not exists visual text not null default '';
alter table drafts add column if not exists is_sample boolean not null default false;
alter table drafts add column if not exists submitted_at text not null default '';
alter table drafts add column if not exists approved_at text not null default '';
alter table drafts add column if not exists approved_by text not null default '';

-- 3. Findings: confidence label and what the finding is about (the text, the alt text, or the visual).
alter table findings add column if not exists confidence text not null default 'high';
alter table findings add column if not exists target text not null default 'body';

-- 4. Uploaded originals (kept for 3 days, or until the visitor deletes their data).
create table if not exists draft_files (
  id text primary key, draft_id text not null, session_id text not null,
  name text not null, mime text not null, size integer not null,
  data text not null, created_at text not null
);

-- 5. Evidence ledger: every claim in an approved piece, the fact behind it, and who approved it.
create table if not exists ledger_entries (
  id text primary key, session_id text not null, draft_id text not null, rev integer not null,
  claim text not null, kind text not null default '', basis text not null default '',
  fact_id text not null default '', fact_statement text not null default '',
  fact_source text not null default '', fact_owner text not null default '',
  fact_expires_on text not null default '', verdict text not null default '', note text not null default '',
  approved_by text not null, approved_at text not null,
  status text not null default 'ok', status_note text not null default '', checked_at text not null default ''
);

-- 6. One row per finding per check run, so insights can count what rules fire over time.
create table if not exists finding_events (
  id text primary key, session_id text not null, draft_id text not null, rev integer not null,
  rule_id text not null, severity text not null, verdict text not null, origin text not null,
  created_at text not null
);

-- 7. Evaluation runs (rules regression and AI check), shared by everyone.
create table if not exists eval_runs (
  id text primary key, kind text not null, model text not null default '', session_id text not null default '',
  started_at text not null, finished_at text not null default '', status text not null default 'running',
  total integer not null default 0, done integer not null default 0,
  metrics text not null default '{}', details text not null default '[]'
);

-- 8. Tester feedback (anonymous).
create table if not exists feedback (
  id text primary key, session_id text not null default '', role text not null default '',
  completed text not null default '', ease integer not null default 0,
  confusing text not null default '', wanted text not null default '', created_at text not null
);

create index if not exists guidelines_ws_idx on guidelines (ws);
create index if not exists facts_ws_idx on facts (ws);
create index if not exists terms_ws_idx on terms (ws);
create index if not exists disclaimers_ws_idx on disclaimers (ws);
create index if not exists draft_files_draft_idx on draft_files (draft_id);
create index if not exists draft_files_created_idx on draft_files (created_at);
create index if not exists ledger_session_idx on ledger_entries (session_id);
create index if not exists ledger_draft_idx on ledger_entries (draft_id);
create index if not exists events_session_idx on finding_events (session_id);
create index if not exists events_draft_idx on finding_events (draft_id);
create index if not exists eval_runs_kind_idx on eval_runs (kind, started_at);

alter table draft_files enable row level security;
alter table ledger_entries enable row level security;
alter table finding_events enable row level security;
alter table eval_runs enable row level security;
alter table feedback enable row level security;
