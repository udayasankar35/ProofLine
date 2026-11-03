import Link from "next/link";
import { aiConfigured, aiModel, aiProvider } from "@/lib/ai";
import { getStore } from "@/lib/store";
import { Card } from "../components/ui";

export const metadata = { title: "How it works and privacy" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">How ProofLine works</h1>
        <p className="mt-1 text-slate-700">
          ProofLine is built around one rule: <strong>no claim goes live without a source.</strong> It reviews a draft before publication, explains each issue, and keeps a human in
          charge of the final decision. After approval it keeps watching the evidence behind every claim.
        </p>
      </div>

      <Card title="What you can check">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Typed or pasted text</strong> (captions, emails, web copy).
          </li>
          <li>
            <strong>Word files (.docx) and PDFs.</strong> The text is read out and checked exactly like typed text. Scanned PDFs are read by an AI vision model.
          </li>
          <li>
            <strong>Images</strong> (PNG, JPEG, WebP). An AI vision model reads the words in the picture, and those words go through the same checks. Alt text is required before review.
          </li>
          <li>Files can be up to 4 MB. Words in a Word file’s headers, footers and picture descriptions are included. Text boxes, comments and tracked changes are not read yet.</li>
        </ul>
      </Card>

      <Card title="How a draft is checked">
        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            <strong>Rules (no AI).</strong> Plain code checks the text against the brand guidelines: banned terms and shouting (R-1, G-1), absolutes and guarantees (R-2, G-3), medical or
            cure wording (R-3, G-4) and the required disclaimer (R-5, G-5). The same text always gives the same result. The required disclaimer itself is never flagged.
          </li>
          <li>
            <strong>Claims against facts (R-4).</strong> Every factual claim (numbers, rankings, proof, comparisons) must match an approved fact that is still in date (G-2, G-6). When an AI
            key is configured, a language model proposes the claims and which fact they match. <strong>Code then verifies it</strong>: the quoted words must really be in the draft, the fact
            must really exist, an expired fact can never make a claim “supported”, a figure that is not in the fact can never be “supported”, and a comparison needs a fact that makes the same comparison.
            If the AI is off, slow or over its limit, a keyword matcher does the job instead, and each finding says which method produced it.
          </li>
          <li>
            <strong>Images and accessibility (R-6 to R-8, G-7).</strong> A picture needs alt text before it can go to review (R-6). For images, an AI vision model also estimates text
            contrast (R-7), very small text (R-7) and colours outside the brand palette (R-8). These are <em>estimates</em> and are labelled “AI-assisted, needs human check”.
          </li>
        </ol>
      </Card>

      <Card title="Confidence labels">
        <p className="text-sm text-slate-700">Every finding says how sure ProofLine is, so a reviewer knows where to look hardest:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            <strong>High:</strong> a fixed rule matched exactly.
          </li>
          <li>
            <strong>Medium:</strong> the AI matched the claim to a specific approved fact and code verified it.
          </li>
          <li>
            <strong>Low:</strong> the AI found no fact for the claim, the keyword matcher guessed, or the finding comes from an image estimate. A person must confirm it.
          </li>
        </ul>
        <p className="mt-2 text-sm text-slate-700">
          How often each kind of finding is actually right is measured on the <Link href="/evaluation" className="text-teal underline">Evaluation</Link> page.
        </p>
      </Card>

      <Card title="After approval: the evidence ledger">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>When a reviewer approves a piece, ProofLine writes one ledger line for every claim: the exact words, the approved fact behind it (as it was that day), its source and owner, and who approved it.</li>
          <li>
            If a fact later expires, is changed or is removed, every approved piece that relied on it is <strong>re-flagged for re-review</strong> automatically. If the evidence is valid again, the flag clears.
          </li>
          <li>Anything the reviewer approved despite an open finding is recorded as a “reviewer exception”, so it can be found later.</li>
          <li>There is no background job in this demo. The ledger is re-checked whenever a fact changes and whenever a list or dashboard page opens.</li>
          <li>
            The <Link href="/insights" className="text-teal underline">Insights</Link> page shows which rules fire most, which findings are disputed most, how long approval takes, and which facts are about to expire.
          </li>
        </ul>
      </Card>

      <Card title="What a person can trust, and what they must still decide">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Every finding shows the exact words, the reason, and the guideline or fact behind it.</li>
          <li>Suggested fixes are only suggestions. Nothing changes until the author applies one, and each change is a new revision. Fixes change ProofLine’s text copy, not your original file.</li>
          <li>The author can dispute a finding with a reason. The reviewer sees that reason before deciding.</li>
          <li>
            Only a reviewer can approve. ProofLine never approves, publishes or sends anything by itself, and it does not give legal advice. Rules and facts are only as good as the
            ones the brand team keeps up to date.
          </li>
          <li>Every check, AI request, decision and approval is written to the audit trail.</li>
        </ul>
      </Card>

      <Card title="Privacy and AI disclosure">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>All data in this demo is fictional. Please do not upload real confidential copy or images.</li>
          <li>
            Each visitor gets a <strong>private workspace</strong>: your drafts, uploaded files, ledger and your changes to the guidelines and facts are visible only to your browser session.
            The demo logins are public on purpose and protect nothing; they only choose a role.
          </li>
          <li>Uploaded files are kept for 3 days and then removed. <strong>“Delete my data”</strong> in the footer removes everything from your session at once.</li>
          <li>
            When AI is on, the draft text and the list of approved facts are sent to the AI provider for claim checking. For images and scanned PDFs, <strong>the image or page itself is sent</strong> to the
            provider’s vision model so it can read it. No names or accounts are sent. The AI key stays on the server and is never sent to your browser.
          </li>
          <li>AI use is capped per visitor and per day to stay within a free quota. When a cap is reached, ProofLine falls back to the rules-only check and says so.</li>
          <li>
            This project was built by one participant with AI assistance (Claude by Anthropic) for writing code, and uses a Gemini-family model for claim extraction and image reading when configured. The
            check rules, the verification logic and the review workflow are the product itself.
          </li>
        </ul>
      </Card>

      <Card title="Known limits">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>The checks are tuned to one made-up brand (AquaPulse). Real brands need their own guidelines, terms and facts, which an admin can edit here.</li>
          <li>Keyword matching only recognises claims with a clear shape (rankings, proof words, figures with units, comparisons). The AI step reads the whole draft but can miss or misjudge a claim.</li>
          <li>Image checks are estimates. Alt text on a PDF cannot be verified. Image reading needs the Gemini provider.</li>
          <li>Word text boxes, comments and tracked changes are not read. Old .doc files, GIF and HEIC images are not supported.</li>
          <li>The test set was written by the same person who wrote the rules, so the measured numbers are optimistic. See the Evaluation page.</li>
        </ul>
      </Card>

      <Card title="This deployment">
        <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-600">Data store</dt>
            <dd>{getStore().mode === "supabase" ? "Supabase (Postgres)" : "In-memory demo store"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-600">AI claim check and image reading</dt>
            <dd>{aiConfigured() ? `On · ${aiProvider()} · ${aiModel()}` : "Off · rules-only mode"}</dd>
          </div>
        </dl>
      </Card>

      <p className="text-sm">
        <Link href="/" className="text-teal underline">
          Back to the demo
        </Link>
      </p>
    </div>
  );
}
