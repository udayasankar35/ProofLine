-- ProofLine database schema. Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run more than once. (Upgrading an existing Round 2 database? Run supabase/migrations/round3.sql instead.)

create table if not exists users (
  id text primary key, name text not null, role text not null, title text not null
);
create table if not exists guidelines (
  ws text not null default 'seed', id text not null, title text not null, text text not null,
  primary key (ws, id)
);
create table if not exists facts (
  ws text not null default 'seed', id text not null, statement text not null, source text not null, owner text not null,
  expires_on text not null, keywords text not null default '',
  primary key (ws, id)
);
create table if not exists terms (
  ws text not null default 'seed', id text not null, term text not null, kind text not null default 'banned',
  replacement text not null default '', reason text not null default '', guideline_ref text not null default 'G-1',
  primary key (ws, id)
);
create table if not exists disclaimers (
  ws text not null default 'seed', id text not null, triggers text not null, text text not null,
  primary key (ws, id)
);
create table if not exists drafts (
  id text primary key, session_id text not null, title text not null, channel text not null,
  author_id text not null, body text not null, rev integer not null default 1,
  status text not null default 'draft', ai_used boolean not null default false,
  created_at text not null, updated_at text not null,
  source_type text not null default 'text', source_name text not null default '',
  alt_text text not null default '', extract_note text not null default '', visual text not null default '',
  is_sample boolean not null default false, submitted_at text not null default '',
  approved_at text not null default '', approved_by text not null default ''
);
create table if not exists revisions (
  id text primary key, draft_id text not null, rev integer not null, body text not null,
  note text not null default '', actor_name text not null, created_at text not null
);
create table if not exists findings (
  id text primary key, draft_id text not null, rev integer not null, rule_id text not null,
  severity text not null, verdict text not null, title text not null, quote text not null,
  reason text not null, source_ref text not null default '', source_text text not null default '',
  fix_kind text not null, suggestion text not null default '', origin text not null,
  decision text not null default 'pending', decision_note text not null default '',
  decided_by text not null default '', created_at text not null,
  confidence text not null default 'high', target text not null default 'body'
);
create table if not exists comments (
  id text primary key, draft_id text not null, author_name text not null, author_role text not null,
  body text not null, created_at text not null
);
create table if not exists audit_log (
  id text primary key, session_id text not null, draft_id text not null default '',
  actor_name text not null, actor_role text not null, action text not null,
  detail text not null default '', created_at text not null
);

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

create index if not exists drafts_session_idx on drafts (session_id);
create index if not exists revisions_draft_idx on revisions (draft_id);
create index if not exists findings_draft_idx on findings (draft_id);
create index if not exists comments_draft_idx on comments (draft_id);
create index if not exists audit_session_idx on audit_log (session_id, created_at);
create index if not exists audit_action_idx on audit_log (action, created_at);

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


-- The app talks to the database only from the server with the service-role key.
-- Row Level Security is switched on with no public policies, so the public (anon) key can read nothing.
alter table users enable row level security;
alter table guidelines enable row level security;
alter table facts enable row level security;
alter table terms enable row level security;
alter table disclaimers enable row level security;
alter table drafts enable row level security;
alter table revisions enable row level security;
alter table findings enable row level security;
alter table comments enable row level security;
alter table audit_log enable row level security;
alter table draft_files enable row level security;
alter table ledger_entries enable row level security;
alter table finding_events enable row level security;
alter table eval_runs enable row level security;
alter table feedback enable row level security;
