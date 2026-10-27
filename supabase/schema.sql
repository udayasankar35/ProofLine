-- ProofLine database schema. Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run more than once.

create table if not exists users (
  id text primary key, name text not null, role text not null, title text not null
);
create table if not exists guidelines (
  id text primary key, title text not null, text text not null
);
create table if not exists facts (
  id text primary key, statement text not null, source text not null, owner text not null,
  expires_on text not null, keywords text not null default ''
);
create table if not exists terms (
  id text primary key, term text not null, kind text not null default 'banned',
  replacement text not null default '', reason text not null default '', guideline_ref text not null default 'G-1'
);
create table if not exists disclaimers (
  id text primary key, triggers text not null, text text not null
);
create table if not exists drafts (
  id text primary key, session_id text not null, title text not null, channel text not null,
  author_id text not null, body text not null, rev integer not null default 1,
  status text not null default 'draft', ai_used boolean not null default false,
  created_at text not null, updated_at text not null
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
  decided_by text not null default '', created_at text not null
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

create index if not exists drafts_session_idx on drafts (session_id);
create index if not exists revisions_draft_idx on revisions (draft_id);
create index if not exists findings_draft_idx on findings (draft_id);
create index if not exists comments_draft_idx on comments (draft_id);
create index if not exists audit_session_idx on audit_log (session_id, created_at);
create index if not exists audit_action_idx on audit_log (action, created_at);

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
