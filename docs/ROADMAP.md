# Roadmap

What ProofLine does today is in the README. This is what comes next, in the order we would do it, and why.

## Next 30 days: make it safe to pilot with one real brand team

**First of all: test with real people.** Five creators and two reviewers use ProofLine on their own copy while we watch where they stop (planned since Round 2, not done in Round 3). The feedback form and the scripted journeys are in place for it. What we learn changes the order of everything below.

1. **Real accounts and teams.** Single sign-on (Google or Microsoft), organisations, invitations, roles per brand. Today's demo logins are public by design. *Why first:* nothing real can be piloted without it.
2. **Connect the brand's own sources.** Import guidelines and facts from Word, PDF or a connected system (a CSV import of facts exists today), and show which approved fact each claim used. *Why:* the quality of every verdict depends on the facts, and typing them in does not scale.
3. **Notifications from the background re-check.** A daily scheduled job already sweeps approved content (and on every fact change or page open). Next: send a message ("3 approved pieces rely on a fact that expires next week") and run it more often than the free hosting plan allows.
4. **Inkloom AI provider.** The provider adapter already speaks the OpenAI-compatible API; add the Inkloom endpoint and run the evaluation against it.

## Next 90 days: better checking

5. **Evaluate on real copy.** Replace the author-written test set with labelled real campaigns from pilot teams, and report the numbers with their confidence intervals. The current set is optimistic by construction.
6. **Images properly.** Measure contrast and text size from pixels instead of asking a model to estimate them; read alt text from PDFs; add images to the evaluation set.
7. **Wider documents.** Word text boxes, comments and tracked changes; PowerPoint and Excel; read the page order of PDFs with columns.
8. **Fix in place.** Apply accepted fixes to the original Word file and return it, instead of a text copy.
9. **Many languages.** Hindi and other Indian languages for terms, claims and alt text.

## Later

10. **Publishing integrations.** Block or warn inside the tools where content is scheduled (social schedulers, CMS), so an unapproved piece cannot be published.
11. **Learning from decisions.** Use disputes and reviewer decisions to suggest new terms, rules and facts, always for an admin to accept.
12. **Policy packs.** Starter guideline sets for regulated categories (food and beverage, health, finance), reviewed by a domain expert.

## What we deliberately did not do in Round 3

- Notifications and a more frequent background job. A daily scheduled sweep exists; it sends nothing, and the free hosting plan allows one run a day.
- Real authentication (out of scope for a public demo; planned first).
- OCR in our own code (we use a vision model, which also estimates colours and text size).

The list is short on purpose: a few things done well beat a long wish list.
