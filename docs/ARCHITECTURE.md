# ProofLine: technical architecture and implementation summary

ProofLine is one Next.js 16 application (App Router, server actions) with a Postgres database (Supabase) and one external AI provider (Gemini by default). There is no separate backend service, queue or cron job. Everything runs in Vercel serverless functions.

```
Browser ── pages and forms (React 19, Tailwind) ──┐
                                                  ▼
                           Next.js server (Vercel functions)
        ┌────────────────────────────┬──────────────────────────────┐
        │ server actions             │ route handlers               │
        │ app/actions.ts             │ /api/files/[id] (private)    │
        │ app/extra-actions.ts       │ /api/health  /api/eval       │
        │ app/evaluation/actions.ts  │ /api/feedback  /drafts/[id]/ │
        └──────────────┬─────────────┴───────────────┬──────────────┘
                       ▼                             ▼
   lib/check.ts  ── the check pipeline ──     lib/ledger.ts, lib/insights.ts
     │   │   │                                      │
     │   │   └─ lib/extract/*  Word, PDF, image reading
     │   └──── lib/ai.ts       provider adapter (Gemini | OpenAI | Anthropic)
     └──────── lib/rules.ts, lib/claims.ts, lib/visual.ts, lib/pipeline.ts
                       │
                       ▼
              lib/store.ts  (memory store or Supabase, same interface)
```

## The check pipeline (`lib/check.ts`, `lib/pipeline.ts`)

A draft has a body of text, and optionally a source file and alt text. `runCheck` does, in order:

1. **Load the visitor's own knowledge base** (guidelines, facts, terms, disclaimers), see "Workspaces" below.
2. **Rules, no AI** (`lib/rules.ts`): R-1 terms and all-caps, R-2 absolutes, R-3 medical wording, R-5 required disclaimer. Text inside a required disclaimer is blanked out first so it is never flagged. Plain regular expressions, deterministic.
3. **Claims against facts (R-4)** (`lib/pipeline.ts` `textStage`):
   - If an AI key is set and a call is available (`lib/aicap.ts` counts per visitor and per day), the model returns *proposed* claims as JSON: the exact quote, a kind, a fact id and a relation.
   - **Code verifies every claim** (`lib/claims.ts`): the quote must be an exact substring of the draft; the fact must exist; an expired fact can never make a claim *supported*; a figure that is not in the fact can never be *supported*; a comparison is only supported by a fact that makes the same comparison; claims that overlap a rule finding or sit inside the required disclaimer are dropped. The AI never decides a verdict on its own.
   - A keyword safety net still catches rankings and proof wording ("#1", "clinically proven") if the AI missed them.
   - With no key, a failure or a cap, a keyword matcher (`rules.ts`) does the whole claim step and the finding says so (origin `fallback`).
4. **Alt text and visual checks** (`lib/visual.ts`): R-6 alt text is an exact rule; R-7 contrast and small text and R-8 palette use measurements the vision model returned (WCAG contrast ratio, text height as a share of the image, CIE76 colour distance) and are always Low confidence, origin `vision`.
5. **Confidence**: High = rule, Medium = AI with a verified fact, Low = AI with no fact, keyword match or vision.
6. Findings replace the old ones; a human's earlier *dispute* on the same finding is carried over. One `finding_events` row per finding is written for the dashboard. An audit line records the run.

The evaluation suite calls the **same `textStage`**, so what is measured is what runs in the app.

## File reading (`lib/extract/`)

`sniff` decides the type from the first bytes, not the file name. Word: `jszip`, paragraph parsing, headers and footers, picture alt text from the drawing properties, and a size guard on every part (zip-bomb). PDF: `unpdf` text layer, with lines wrapped mid-sentence joined; a PDF with no text layer is sent to the vision model. Image: the vision model returns the visible text, a suggested alt text, text blocks with estimated size and colours, and the dominant colours. Text is clipped at 12,000 characters. Original files are stored in `draft_files` for 3 days and served only to the session that uploaded them (`/api/files/[id]`).

## Evidence ledger and re-flag (`lib/ledger.ts`)

At approval, `buildLedger` writes one row per finding: a supported R-4 claim becomes **evidence** (a snapshot of the fact's statement, source, owner and expiry, plus the approver and time); anything else the reviewer approved while it was open becomes a **reviewer exception**. `sweepWorkspace(session)` evaluates each row against the visitor's current facts (`ok`, `expired`, `changed`, `removed`, `exception`), moves approved drafts with a broken row to `reflagged`, and moves them back when every row is valid again. It runs after every fact change and when list and dashboard pages open. This is deliberate: no cron job is needed, at the price that a page must be opened for the sweep to run (declared on the Ledger and About pages).

## Workspaces (privacy by design)

Each browser session gets a **private workspace**: its drafts, files, ledger, history, audit lines and its own copy of the guidelines, facts, terms and disclaimers (the four knowledge tables have a `ws` column and a composite primary key). `ensureWorkspace` seeds the copy on first use. Changing a fact in your session never changes anyone else's. The demo logins only choose a role. `deleteMyData` (footer) purges a session in one step. Caps: 25 drafts and 8 files per session.

## Evaluation suite (`lib/eval/`)

`dataset.ts` holds 129 labelled drafts pinned to a fixed date. `run.ts` scores predictions against labels (one-to-one matching on rule and overlapping quote; precision, recall and F1 per class; confidence calibration; baseline comparison). `runs.ts` runs the **AI evaluation** in resumable batches from the browser (two drafts per request, so each request stays well inside the time limit), stores one row per draft including the AI's raw answer, and re-scores from those saved answers with the code that is deployed now. `baseline.json` is the regression baseline used by the unit test gate and the one-click regression run. See [EVALUATION.md](EVALUATION.md).

## Data model (`supabase/schema.sql`)

`users`, `guidelines`, `facts`, `terms`, `disclaimers` (knowledge, per workspace) · `drafts`, `revisions`, `findings`, `comments` · `draft_files` · `ledger_entries` · `finding_events` · `audit_log` · `eval_runs` · `feedback`. Row Level Security is on for every table with no public policy; the app reaches the database only from the server with the service-role key, which is never sent to the browser. `supabase/migrations/round3.sql` upgrades a Round 2 database; the two paths were checked for parity.

## Reliability decisions

- **Idempotent actions.** Double clicks and stale forms never apply a change twice or error: a second "send to review" or "approve" shows a calm notice instead.
- **Bad input** gets a message a person can act on (empty, too short, wrong type, oversized, damaged, password-protected, no text found), never a stack trace.
- **AI failure is never fatal.** Model fallbacks, retries for busy models, then rules-only with a visible note.
- **Cost control.** Per-visitor and per-day AI caps; the evaluation run has its own budget and leaves 120 requests a day for visitors.
- **Redirects** are never called inside `try/catch` (Next.js implements them as exceptions).
- **Deploy gate.** `prebuild` runs the unit tests, including the "no check is worse than the baseline" test.

## Security and privacy summary

Server-only secrets; RLS with no public policies; session-private files and workspaces; file contents checked by magic bytes; zip-bomb guard; no personal data collected (feedback is anonymous); images and scanned pages are sent to the AI provider's vision model only when AI is on, and the About page says so. Demo credentials are public by design and protect nothing.

## Declared limits

See the "Known limits" section of the [README](../README.md).
