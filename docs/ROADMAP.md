# Roadmap

What ProofLine does today is in the README. This is what comes next, in the order we would do it, and why.

## Next 30 days: make it safe to pilot with one real brand team

1. **Real accounts and teams.** Single sign-on (Google or Microsoft), organisations, invitations, roles per brand. Today's demo logins are public by design. *Why first:* nothing real can be piloted without it.
2. **Connect the brand's own sources.** Import guidelines and facts from a document or a table, and show which approved fact each claim used. *Why:* the quality of every verdict depends on the facts, and typing them in does not scale.
3. **A background re-check.** A scheduled job that sweeps approved content every night and sends a message ("3 approved pieces rely on a fact that expires next week"). Today the sweep runs when a fact changes or a page opens.
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

- A scheduled background job (needs a paid plan; the on-demand sweep is declared).
- Real authentication (out of scope for a public demo; planned first).
- OCR in our own code (we use a vision model, which also estimates colours and text size).

Each item above has a reason and a size estimate in the team's backlog; we kept this list short on purpose.
