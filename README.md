# ProofLine

**No claim goes live without a source.**

ProofLine is a brand-governance platform. It reviews marketing content *before* publication against approved brand guidelines, terminology and facts, explains every issue, suggests a fix, and keeps a human reviewer in charge of the final decision. After approval it keeps watching the evidence behind each claim and re-flags the piece when that evidence expires, changes or disappears.

Built solo for CodeStar 30 (We Code Coders, sponsor Inkloom AI). Round 2 built the core; **Round 3 (31 Oct to 3 Nov 2026) delivers three improvements**: image and document review, an evidence ledger with a governance dashboard, and an evaluation and reliability suite. All demo data is fictional (a made-up sports drink, "AquaPulse").

- **Live demo:** https://proof-line-sigma.vercel.app
- **Repository:** https://github.com/udayasankar35/ProofLine
- **Documents:** [Architecture](docs/ARCHITECTURE.md) · [Evaluation](docs/EVALUATION.md) · [Testing](docs/TESTING.md) · [Roadmap](docs/ROADMAP.md) · [Product document (PDF)](docs/ProofLine-Round3-Product-Document.pdf)

## Try it in two minutes (no sign-up)

The demo logins are shown on the home page on purpose. Pick one (or type the email and password):

| Role | Email | Password |
|---|---|---|
| Creator (Devon) | `devon@aquapulse.demo` | `proofline-demo` |
| Reviewer (Elena) | `elena@aquapulse.demo` | `proofline-demo` |
| Admin (Asha) | `asha@aquapulse.demo` | `proofline-demo` |

1. As **Devon**: **New draft**, load the sample *Instagram caption (risky)*, press **Check this draft**. Read the findings, **Apply this fix** on a few, **Dispute** one with a reason.
2. Try **Upload** on the same page: the sample *Social tile (image)*, *Press release (Word)* or *Flyer (PDF)* buttons run the new document and image review. An image needs alt text before it can go to review.
3. When no high-risk finding is open, **Send to review**. Switch to **Elena** and **Approve**. Approval writes the **Evidence ledger**.
4. Switch to **Asha**, open **Guidelines & facts**, and move a fact's *Valid until* date into the past. The approved piece is re-flagged automatically (see **Review queue** and **Evidence ledger**). Put the date back and it clears.
5. Open **Insights** (use *Load sample history* for a full dashboard) and **Evaluation** (precision and recall per rule, one-click regression run, AI evaluation).

## What is built

### Round 2 (the core)

- **Two-stage check.** Stage 1: deterministic rules, no AI. Stage 2: every factual claim is matched to an approved, in-date fact.
- **Rules:** R-1 terms and all-caps (G-1), R-2 absolutes and guarantees (G-3), R-3 medical or cure wording (G-4), R-4 claims that need evidence (G-2, G-6), R-5 missing required disclaimer (G-5).
- **AI claim check with code-side verification.** A model proposes claims and the fact they match. Code verifies: the quote must be in the draft, the fact must exist, an expired fact can never make a claim "supported", figures must match, a comparison needs a fact making the same comparison. The model never approves anything.
- **Rules-only fallback** when there is no key, the call fails or a usage cap is reached; the page says so.
- **Explain and fix**, **dispute with a reason**, **human-only approval**, **knowledge-base admin**, **audit trail**, **check report download**.

### Round 3 (the three improvements)

**1. Image and document review**
- Upload **Word (.docx)**, **PDF** or **image (PNG, JPEG, WebP)**, up to 4 MB. Text is extracted (Word and PDF text layers directly, scanned PDFs and images by a vision model) and runs through the same rules and claim checks as typed text.
- **R-6 alt text** (exact, blocks review): missing, too short, a file name or a generic word. Word pictures are checked from the file itself; decorative pictures are allowed.
- **R-7 contrast and small text** and **R-8 off-palette colours** (G-7) for images, estimated by the vision model and always labelled *AI-assisted, needs a human check* with Low confidence.
- Friendly handling of bad input: empty, wrong type (GIF, HEIC, old .doc), renamed files, damaged or password-protected files, oversized files, files with no text.
- Upload a new version, read a file again, download the corrected text. Fixes change ProofLine's text copy, not your original file.

**2. Evidence ledger and governance insights**
- On approval, one **ledger line per claim**: the words, the approved fact behind it (a snapshot of its statement, source, owner and expiry), who approved it and when. Findings approved while still open are recorded as **reviewer exceptions**.
- **Automatic re-flag**: when a fact expires, is edited or is removed, every approved piece that relied on it moves to *Re-review needed*. When the evidence is valid again it clears. The check runs after every fact change, whenever a list or dashboard page opens, and **once a day from a scheduled background job** (Vercel Cron, about 02:00 IST; `/api/cron/sweep`). It sends no notifications yet.
- **CSV import of approved facts** (admin): upload a CSV with `statement`, `source`, `expires_on` (and optional `owner`, `keywords`); good rows are added, every skipped row is explained, repeats are skipped. A sample file is on the page.
- **Insights**: most-triggered rules, most-disputed findings, time to approval, facts about to expire (with how many approved pieces rely on each). Empty state, *all* or *only my drafts*, and optional fictional sample history so the dashboard can be seen with data.

**3. Reliability and evaluation suite**
- **129 labelled drafts** (82 typical violations, 16 hard paraphrases, 31 clean controls) with expected findings written from the guidelines, not from the engine's output.
- **Evaluation page**: precision and recall per check, the first run before any fix next to the current figures, a one-click **regression run** against a stored baseline, and an **AI evaluation** that scores the AI claim step next to keyword matching on the same drafts. Confidence labels are checked too: are "Medium" findings really right more often than "Low" ones?
- **Confidence labels on every finding**: High (fixed rule), Medium (AI matched a specific fact, verified by code), Low (no fact, keyword guess, or image estimate). Each finding also shows a measured "how often is this check right" line.
- **Gates**: `npm test` (89 tests, including dataset integrity and "no check is worse than the baseline") runs automatically before every build, so a regression cannot be deployed.

Measured results (full detail and honest caveats in [docs/EVALUATION.md](docs/EVALUATION.md)):

| | First run (before fixes) | After fixes |
|---|---|---|
| Fixed rules and keyword matching, precision | 93.6% | 100% |
| Fixed rules and keyword matching, recall | 81.1% | 86.6% (typical violations 100%, hard paraphrases 0% by design) |
| Good drafts flagged wrongly (31 clean controls) | 2 | 0 |
| AI claim step vs keyword matching (65 claim drafts, one live run) | | Problem-claim recall 76% keyword vs 88% AI (90% with the extended keyword safety net); true claims tied to the right fact 50% vs 100%; precision 100% and 0 false alarms in both. One run, one model; see docs/EVALUATION.md |

The first run found six real defects (for example, the required disclaimer was flagged as a violation, and "better than any rival" was marked *supported*). They are fixed and each has a test.

## Tech stack

Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, Supabase Postgres (from the server only), Vercel. `jszip` (Word), `unpdf` (PDF text), Gemini vision for images and scanned PDFs. Tests: Node's test runner via `tsx`, Playwright for end to end.

## Project layout

```
app/                    pages and server actions
app/evaluation/         evaluation page, regression and AI-run actions
app/ledger, insights/   evidence ledger and governance dashboard
app/components/         finding card, upload form, nav, shared UI
lib/rules.ts            deterministic rules (R-1 to R-5), fixes, disclaimer masking
lib/claims.ts           code-side verification of AI-proposed claims
lib/pipeline.ts         the text stage shared by the app and the evaluation suite
lib/check.ts            the check run: AI cap, fallback, alt text, visual findings, confidence
lib/visual.ts           R-6 to R-8 (alt text, contrast, small text, palette)
lib/extract/            Word, PDF and image reading, file-type sniffing
lib/ledger.ts           ledger lines, re-flag sweep
lib/insights.ts         dashboard numbers
lib/eval/               labelled dataset, scorer, baseline, AI-run store
lib/store.ts            data store: in-memory or Supabase, per-session workspaces
supabase/schema.sql     full database schema (fresh install)
supabase/migrations/    upgrade script from the Round 2 database
docs/                   architecture, evaluation, testing, roadmap
tests/                  Playwright end-to-end scripts and the mock AI
```

## Run it locally

```bash
git clone https://github.com/udayasankar35/ProofLine.git
cd ProofLine
npm install
cp .env.example .env.local   # optional: leave empty for in-memory data and rules-only mode
npm run dev                  # http://localhost:3000
```

With no `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` the app uses an in-memory store (it resets on restart). With no `AI_API_KEY` it runs rules-only: everything works, uploads of Word and text-layer PDFs work, and image reading says the AI reader is not available.

Environment variables (see `.env.example`): `CRON_SECRET` (optional: if set, only the scheduled job may call `/api/cron/sweep`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER` (`gemini` | `openai` | `anthropic`; image reading needs `gemini`), `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (OpenAI-compatible endpoints), `AI_SESSION_CAP` (default 20 AI calls per visitor), `AI_DAILY_CAP` (default 400 per day). The AI key is read on the server only.

## Deploy

1. Supabase, SQL Editor: run `supabase/schema.sql` (fresh database) or `supabase/migrations/round3.sql` (upgrading a Round 2 database).
2. Vercel: import the repo, add the environment variables, deploy. The build runs the unit and regression tests first (`prebuild`).
3. Open `/api/health` to check the database and AI configuration; `/api/health?check=schema` checks every table and column.

## Tests

```bash
npm test             # 89 unit tests, includes the evaluation dataset and the regression gate
npm run eval         # prints precision and recall per check (add -- --failures to list wrong drafts)
```

End to end (needs `pip install playwright` and Chromium; run against any deployment):

```bash
npm run build && npm start &                          # or use the live URL
python3 tests/e2e.py http://localhost:3000            # core path: check, fix, dispute, review, approve, audit
python3 tests/e2e-upload.py http://localhost:3000     # Word, PDF and image review, bad input, file privacy
python3 tests/e2e-governance.py http://localhost:3000 # ledger, automatic re-flag, insights, evaluation, feedback
python3 tests/e2e-login.py http://localhost:3000      # demo credentials and sign-in
python3 tests/e2e-layout.py http://localhost:3000     # no sideways scroll at phone, tablet and laptop widths
```

To test the AI paths without a key: `node tests/mock-ai.mjs` (a stand-in for the model on port 4010), then start the app with `AI_PROVIDER=gemini AI_API_KEY=test AI_BASE_URL=http://localhost:4010 AI_MODEL=mock` and run the scripts with `ai` as a second argument. See [docs/TESTING.md](docs/TESTING.md).

## Known limits (declared, not hidden)

- The checks are tuned to one made-up brand. A real deployment loads its own guidelines, terms and facts (an admin can edit them in the app).
- The evaluation set was written by the same person who wrote the rules, so its numbers are optimistic. The AI numbers are a snapshot of one model on one day.
- Keyword matching only recognises claims with a clear shape; the AI step reads the whole draft but can miss or misjudge a claim. That is why a reviewer always decides.
- Image checks (contrast, small text, palette) are AI estimates and always need a human check. Images are not in the evaluation set.
- Fixes edit ProofLine's text copy, not the original file. Alt text inside a PDF cannot be verified. Word text boxes, comments and tracked changes are not read. Old .doc, GIF and HEIC files are not supported.
- Vision needs the Gemini provider. Files are kept for 3 days. The ledger is re-checked when a fact changes, when pages open and once a day by the scheduled job (the free hosting plan allows one run a day; no notifications yet). Importing facts needs a CSV file; Word or PDF import of facts is not built.
- Demo sign-in is role-picking with public credentials, not real accounts. ProofLine supports review; it is not legal advice.

## What is next

See [docs/ROADMAP.md](docs/ROADMAP.md).
