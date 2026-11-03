# Evaluation and reliability report

This is the written version of the in-app **Evaluation** page (`/evaluation`). Raw numbers are also served as JSON at `/api/eval`, and everything here can be reproduced with `npm run eval`.

## 1. What we measured and how

**The set.** 129 short AquaPulse drafts (`lib/eval/dataset.ts`), each with the findings a careful reviewer would expect. The labels were written from the brand guidelines (G-1 to G-6) and the approved facts (F-01 to F-14), **not** by copying what the engine printed. Dates are pinned to 1 Nov 2026, so labels do not change when a fact expires.

| Set | Drafts | Purpose |
|---|---|---|
| Typical ("core") | 82 | the violations the rules are designed to catch: 12 terms/tone, 12 absolutes, 12 medical wording, 24 claims (supported, unsupported, outdated), 8 disclaimer cases, 14 combinations |
| Hard | 16 | paraphrases and indirect wording a fixed rule cannot see ("Nothing beats AquaPulse", "Cleanse your system", "launched in 2019", "Free delivery on orders above Rs 299"). **We did not write rules for these**, so they measure what the AI step adds |
| Clean controls | 31 | good copy that must not be flagged, including true claims and the required disclaimer |

**Scoring** (`lib/eval/run.ts`). Each prediction is matched one-to-one with an expected finding of the same class whose quoted words overlap. A match is a true positive, an unmatched prediction a false alarm, an unmatched expectation a miss. The classes are R-1, R-2, R-3, R-4 (a claim that is unsupported or outdated), R-4 *supported* (a true claim tied to the right fact) and R-5. **Precision** = right ÷ (right + false alarms); **recall** = right ÷ (right + missed). Two things are tracked separately: whether the *verdict* on a found R-4 claim was right, and whether a supported claim was tied to the *right fact*. The evaluation calls the same `textStage` function the app uses.

## 2. Results: fixed rules and keyword matching (no AI)

| Check | First run (before fixes) precision / recall | Now precision / recall | Right | False alarms | Missed |
|---|---|---|---|---|---|
| R-1 terms and tone | 100% / 91% | 100% / 100% | 23 | 0 | 0 |
| R-2 absolutes | 100% / 92% | 100% / 92% | 23 | 0 | 2 |
| R-3 medical wording | 83% / 79% | 100% / 79% | 19 | 0 | 5 |
| R-4 unsupported or outdated claims | 90% / 63% | 100% / 76% | 31 | 0 | 10 |
| R-4 true claims tied to the right fact | 64% / 50% | 100% / 50% | 9 | 0 | 9 |
| R-5 required disclaimer | 100% / 100% | 100% / 100% | 14 | 0 | 0 |
| **All problem classes** | **93.6% / 81.1%** | **100% / 86.6%** | 110 | 0 | 17 |

- Typical violations: precision 100%, recall 100% **after** fixes. We used this set to find and fix defects, so these figures are optimistic and the first-run column is the more honest signal.
- Hard paraphrases: the rules alone find 0 of the 17 expected findings, by design.
- Clean controls: 0 of 31 flagged wrongly (first run: 2 of 31).
- Verdicts: right on 29 of 31 found claims. The two misses are "Rated number one by athletes" and "Top-rated by 9 out of 10 athletes": the keyword matcher links "number one" and "top-rated" to the expired category-ranking fact and calls them *outdated*, when no fact covers them at all. Both are still flagged as problems, only the explanation is imprecise.
- True claims: keyword matching only recognises claims with a clear shape, so it ties 9 of 18 true claims to a fact. It never ties one to the wrong fact (9 of 9). The AI step is meant to close this gap (section 4).

## 3. What the first run found (and what we did)

The first run was recorded **before any change** (`docs/eval-first-run.txt`). It found six defects in the Round 2 engine; each was fixed and has a test (`lib/rules.fixes.test.ts`):

1. **The required disclaimer was flagged as a violation.** Its own words ("not intended to diagnose, treat, **cure or prevent** any disease") triggered the medical-wording rule, so a correct post failed. Text inside a required disclaimer is now ignored by every wording rule and by the AI claim step.
2. **Plural and hyphenated terms were missed** ("energy drinks", "energy-drink"). Terms now match plurals and hyphen or space variants and suggest a matching plural.
3. **"Better than any rival", "Cheaper than every rival" and "better than rival brands" were marked *supported*** because the fact about a taste preference mentions a rival. This was the most serious: a false "supported" tells a reviewer a claim is safe when it is not. A comparison is now only supported by a fact that makes the same comparison, in the rules **and** in the AI verification code.
4. **"India's best-selling" was quoted as "India's best"**, so applying the fix would have left "-selling" behind. The whole phrase is quoted now.
5. **"Tastier than the leading brand"** raised a ranking claim about AquaPulse, but "the leading brand" is a competitor. After *than, over, versus, beats* it is no longer a ranking claim.
6. **One sentence reported the same fact twice** ("7 in 10 consumers preferred AquaPulse ... over a leading rival" gave two *supported* findings). The same fact in the same clause is reported once.

The evaluation also **caught a regression of our own** while we were fixing item 2: a slip in a regular expression made every banned term containing an "s" stop matching, and R-1 recall dropped from 91% to 70% on the next run. It was fixed before it was committed. Later, a robustness test found that an admin term such as "-" would have matched everywhere (a side effect of the same change); the rule now skips such terms and the admin form refuses them.

## 4. The AI claim check

One live run on 3 Nov 2026 (05:41 IST) through the deployed app, with Google Gemini (`gemini-3.5-flash-lite`). It sent the **65 drafts that contain a claim, a ranking or a comparison** (42 typical, 10 hard, 13 clean controls) and scored the answers against the same labels as the keyword matcher. 0 requests failed. The AI's raw answers are saved, so every number below can be re-scored without new AI requests. The same figures are at `/evaluation` and `/api/eval`.

**First AI run, recorded before any change** (cells are precision / recall)

| Measure | Keyword matching alone | With the AI step |
|---|---|---|
| Claims that are a problem (unsupported or outdated) | 100% / 76% | 100% / 88% (36 found, 5 missed) |
| True claims tied to the right approved fact | 100% / 50% | 100% / 100% (18 of 18) |
| Right verdict on the problem claims found | 29 of 31 | 34 of 36 |
| Good drafts flagged wrongly (13 clean controls) | 0 | 0 |

So the AI step finds more problem claims than keywords and matches every true claim to the right fact, which keywords do for only half. It did not add false alarms.

**Where the AI step was wrong (7 drafts):** it missed "9 out of 10" (E-055), "Up to 25%" (E-057), "better than" (E-075), "Nothing beats" (E-086) and "Scientifically formulated" (E-089); and it called "#1" (E-069) and "best-selling" (E-074) *unsupported* when the right verdict was *outdated* (an expired fact exists). The list is under "Show the drafts where the AI step was wrong" on the Evaluation page.

**One change made because of this run.** Three of the misses were figures or comparisons that the keyword matcher recognises, so in AI mode the keyword safety net, which already covered rankings and proof wording, now also covers figures and comparisons the AI did not cover (anything the AI covered still wins). Re-scored from the same saved answers, with no new AI requests: recall on problem claims went from 88% (36 of 41) to **90% (37 of 41)**, precision stayed 100%, verdicts 35 of 37, clean controls 0 of 13. Only one of the five misses was fixed by it: two have no keyword pattern at all, and for the other two the safety net added nothing (we did not investigate further). We stopped there on purpose: tuning further on the same drafts would only measure how well we fitted them. This change was chosen after seeing these failures, so the 90% is optimistic, and the 10 hard drafts are no longer a clean held-out check for it.

**Do the confidence labels mean something?** In this run, Medium findings were right 35 of 35 times and Low findings 13 of 13 times. Both are 100%, so the run **does not show that Medium is better than Low**; the sample is too small to separate them. We report the labels as an honest guide to where a reviewer should look hardest, not as a measured probability.

**Caveats.** One run, one day, one model (a backup model was used for this run); the free AI quota limits runs to 2 a day, so we did not repeat it. Results shift a little from run to run. These drafts were written by the same person who wrote the rules.


## 5. Confidence labels

Every finding shows **High** (a fixed rule matched exactly), **Medium** (the AI matched the claim to a specific approved fact and code verified it) or **Low** (the AI found no fact, the keyword matcher guessed, or the finding is an image estimate). Each finding also shows how often that kind of finding was right on the test set. Section 4 reports whether "Medium" findings really were right more often than "Low" ones.

## 6. Regression protection

- `lib/eval/baseline.json` stores the precision and recall of every check as of the last accepted run.
- `npm test` includes "no check is worse than the baseline" and "no false alarm on any clean control". It runs automatically before every build (`prebuild`), so a change that makes a check worse cannot be deployed.
- The **Run regression now** button on the Evaluation page does the same on the live site and keeps a history of runs.
- The AI step cannot be re-run for free, but its **raw answers are saved per draft**, so after a code change it is re-scored from those saved answers with the code that is deployed now, with no new AI requests.

## 7. Limits of this evaluation (please read)

- One person wrote both the rules and the 129 drafts. The numbers show consistency with the brand guidelines, **not** performance on copy nobody here has seen. The typical-violation set was used to fix defects, so its post-fix numbers are optimistic. Only the first run and the hard set are close to an unbiased signal.
- The set is small, and in one made-up brand. Confidence intervals would be wide; we did not compute them.
- Image checks (alt text, contrast, small text, palette) and document extraction are covered by unit and end-to-end tests but are **not** in this precision and recall set. Image findings are estimates and are always labelled as needing a human check.
- The AI step is non-deterministic and model versions change. Its numbers are a dated snapshot.
- The 16 hard drafts were left out of rule writing on purpose; if we had tuned rules on them the rules would look better and the AI would look worse than either really is.

## 8. Reproduce

```bash
npm run eval                      # the table above
npm run eval -- --failures        # every wrong draft, with what was missed or wrongly flagged
npm test                          # includes the dataset checks and the regression gate
npm run eval:baseline             # only on purpose: accept the current numbers as the new baseline
```
