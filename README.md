# ProofLine

**No claim goes live without a source.**

ProofLine is a brand-governance platform. It reviews marketing content *before* publication against approved brand guidelines, terminology and facts, explains each issue, suggests a fix, and keeps a human reviewer in charge of the final decision.

Built solo for the CodeStar 30 hackathon (Round 2: The Build). All demo data is fictional (a made-up sports drink, "AquaPulse").

## Try it (no sign-up)

1. Open the live link and press **Enter as Devon** (a demo creator).
2. **New draft** → load the sample *Instagram caption (risky)* → **Check this draft**.
3. Read the findings. Each one shows the exact words, why they are a problem, the guideline or approved fact behind it, and a suggested fix. The "#1" claim is flagged because its evidence expired.
4. **Apply this fix** on a few, and **Dispute** one with a reason. Each fix is a new revision and re-checks automatically.
5. When no high-risk finding is open, **Send to review**. Use *Switch to → Reviewer* (Elena) to **Approve** or **Request changes**.
6. Switch to **Admin** (Asha), change a fact's expiry date, then re-check a draft and watch the verdict change.
7. Open **Audit trail** to see every step. Approved drafts have a downloadable check report.

## What is built

- **Two-stage check.** Stage 1 is deterministic rules with no AI. Stage 2 matches every factual claim to an approved, in-date fact.
- **Rules** (IDs match the Round 1 plan): R-1 terms and all-caps (G-1), R-2 absolutes, guarantees and time-bound promises (G-3), R-3 medical or cure wording (G-4), R-4 claims that need evidence (G-2, G-6), R-5 missing required disclaimer (G-5).
- **AI claim check with code-side verification.** A language model proposes claims and the fact they match. Code then verifies: the quote must be an exact substring of the draft, the cited fact must exist, an expired fact can never make a claim "supported", and a model can never approve anything. Findings are labelled *Rule*, *Rules-only match* or *AI-assisted, verified by code*.
- **Rules-only fallback.** With no AI key, if the AI call fails, or when an AI usage cap is reached, a keyword matcher does the claim matching and the page says so.
- **Explain and fix.** Every finding has the quote, the reason, the source text, and a suggestion (replace, remove, append or manual). Applying a fix creates a revision.
- **Dispute with a reason.** The author can dispute a finding, the reviewer sees the reason, and disputes survive re-checks.
- **Human approval workflow.** Draft → In review → Approved or Changes requested. Only the Reviewer role can approve, and sending to review is blocked while high-risk findings are open.
- **Knowledge base admin.** Guidelines, approved facts (with source, owner and expiry), terms to avoid and the required disclaimer. The admin can add facts and terms, change expiry dates and restore the demo set.
- **Audit trail** of every check, AI request, decision and approval, plus a **check report** download.
- **Confidentiality.** Drafts are isolated per browser session, the database is only reachable from the server (RLS on, no public policies), and the AI key never reaches the browser.
- **AI disclosure.** The footer and the *How it works* page state whether AI is on and how it is used. This project was built with AI assistance (Claude by Anthropic) and uses a Gemini-family model for claim extraction when configured.

## Tech stack

Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres) via `@supabase/supabase-js` from the server only, Vercel hosting. Tests use Node's test runner (via `tsx`) and Playwright.

## Project layout

```
app/                 pages and server actions (actions.ts)
app/components/      UI pieces (finding card, highlighted text, nav)
lib/rules.ts         deterministic rules, fix application, highlighting
lib/ai.ts            provider adapter (gemini | openai | anthropic)
lib/claims.ts        verification of AI-proposed claims
lib/check.ts         the check pipeline, AI caps, fallback, decision carry-over
lib/store.ts         data store: in-memory or Supabase, auto-seeding
lib/seed.ts          fictional demo data
supabase/schema.sql  database tables
tests/               unit tests (lib/*.test.ts), e2e.py, mock-ai.mjs
```

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: leave empty for in-memory + rules-only mode
npm run dev                  # http://localhost:3000
npm test                     # unit tests
```

Without `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, ProofLine uses an in-memory store (resets on restart). Without `AI_API_KEY`, it runs in rules-only mode.

## Deploy

1. Supabase → SQL Editor → run `supabase/schema.sql`.
2. Vercel → import this repo → set the environment variables from `.env.example` → Deploy.
3. The first request seeds the demo guidelines, facts and terms automatically.

## Tests

- `npm test` runs 23 unit tests (rules, fix application, claim verification, AI-reply parsing).
- `python3 tests/e2e.py <url>` drives a real browser through the whole path: check, blocked submit, fix, dispute, review, approve, admin changes a fact, audit trail, report, session isolation and mobile layout. `node tests/mock-ai.mjs` plus `python3 tests/e2e.py <url> ai` tests the AI path against a local stand-in for the model.

## Known limits (honest list)

- Text only: no image, PDF or Word upload yet.
- The rule set and facts are tailored to the demo brand. A real deployment would load its own.
- Claim matching in rules-only mode is keyword-based and can miss paraphrases. That is why the reviewer always decides.
- Demo sign-in is role-picking, not real accounts.
- ProofLine supports review. It is not legal advice.

## Next (Round 3)

1. Review images and uploaded documents (OCR plus the same claim pipeline).
2. Governance insights dashboard (most common violations, time to approval, expiring evidence).
3. Evidence ledger that re-flags already-approved content when a fact expires or changes, plus a regression suite that tracks check accuracy.
