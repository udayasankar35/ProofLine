# Testing details

Everything below can be re-run from a fresh clone (see the README). Numbers are from the final build.

## Layers

| Layer | What | How to run | Count |
|---|---|---|---|
| Unit | rules, fixes, claim verification, AI-reply parsing, visual checks, ledger, extraction, insights, evaluation dataset and regression gate | `npm test` | 89 tests |
| Evaluation | 129 labelled drafts scored for precision and recall | `npm run eval`, `/evaluation` page | 129 drafts |
| End to end | a real browser (Playwright) against a running deployment | `python3 tests/<script>.py <url>` | 5 scripts |
| Gate | unit tests plus "nothing worse than baseline" before every build | automatic (`prebuild`) | |

## End-to-end scripts

- `tests/e2e.py`: the core path. Landing, sign-in, sample draft, findings visible, send-to-review blocked while a high-risk finding is open, apply fix (new revision), dispute with a reason, review (request changes needs a note, approve), approved draft locked for the creator, admin changes a fact and the verdict changes, audit trail, report download, session isolation, mobile layout.
- `tests/e2e-upload.py`: image, Word and PDF review (sample files and generated files), alt text required and saved twice harmlessly, vision findings labelled as needing a human check, replacing and re-reading a file, corrected-text download, empty / wrong-type / renamed / damaged / oversized files, original files private to the session, no console errors.
- `tests/e2e-governance.py`: empty ledger, approval writes the ledger, **expiring a fact re-flags the approved piece**, restoring clears it, **removing a fact re-flags**, restoring the demo data clears it, insights empty state / sample history / "only my drafts" / removal, CSV import of facts (good file, repeat, mixed rows, wrong columns, admin-only form), evaluation regression run, feedback form.
- `tests/e2e-login.py`: credentials visible on the home page, wrong password, unknown email, capitals and spaces in the email, one-click entry, signed-out redirect with an explanation.
- `tests/e2e-layout.py`: 16 pages at 375, 768 and 1280 px wide as creator and admin; no sideways scroll and nothing outside the screen.

The AI paths run against `tests/mock-ai.mjs`, a small stand-in for the Gemini API (claims, vision answers, busy and failing models) so they are testable without a key. The scripts take `ai` as a second argument to expect AI-assisted labels. The real model is exercised by the live **AI evaluation** (see EVALUATION.md) and by manual checks on the live site.

## Load and concurrency (local, honest scope)

Run on the production build on the sandbox machine, in-memory store, rules-only mode. This is **not** a measurement of the live Vercel and Supabase deployment, and not a stress test; it shows that nothing breaks or leaks between users when many use it at once.

| Test | Result |
|---|---|
| 50 simultaneous connections for 15 s on the home page | 3,300 requests, about 220 per second, median 211 ms, 99th percentile 414 ms, 0 errors |
| The same on the About page | 3,600 requests, about 240 per second, median 204 ms, 99th percentile 294 ms, 0 errors |
| The same on `/api/health` | 13,882 requests, about 925 per second, median 52 ms, 0 errors |
| 8 complete browser journeys (sign-in, check, fix, dispute, review, approve, audit, session isolation) running at the same time against one server | 8 of 8 passed in 44 s; each user saw only their own drafts |

Not tested: the live deployment under load, the AI provider's rate limits under many users (a per-visitor cap, a daily cap and a visible rules-only fallback protect it), and the database under concurrent writes beyond the 8 journeys above.

## What the tests caught while building (examples)

- The first evaluation run found six defects in the Round 2 rules (see EVALUATION.md).
- Re-running it after a change caught a regression the same hour: a regular-expression slip that made every banned term containing an "s" stop matching (R-1 recall fell from 91% to 70%). It was fixed before commit.
- End-to-end runs found a React hydration error caused by a form inside a paragraph in the footer, a case where a required disclaimer was flagged by its own words, and a PDF sample where the AI missed "clinically proven" (now covered by a keyword safety net).
- Test-design lessons: a failing-then-passing run turned out to be the test typing while the previous submit was still finishing, so the tests now wait for each action to finish.

## Manual checks

Sign-in as each role; upload of real Word, PDF and PNG files; phone-width screenshots of the main pages; clone and run with no environment variables (in-memory, rules-only); clone and run with the mock AI.

## Tester feedback

**Not done: testing with real users.** Round 2 listed testing with 5 creators and 2 reviewers as Round 3 work. We did not recruit outside testers in Round 3, so there are no human usability numbers to report and we do not invent any.

What exists instead:

- An anonymous in-app feedback form (`/feedback`; summary at `/api/feedback`), live and tested end to end, so real feedback can be collected the moment anyone uses the product. At the time of submission it held no responses.
- Five scripted browser journeys that start from a cold session and use only what is on screen (labels and buttons), at phone, tablet and laptop widths. They show the main path can be finished without knowing anything about the app. They are not a substitute for people.

Testing with real creators and reviewers is the first step of the roadmap.
