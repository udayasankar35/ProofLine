import Link from "next/link";
import { aiConfigured, aiModel, aiProvider } from "@/lib/ai";
import { getStore } from "@/lib/store";
import { Card } from "../components/ui";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">How ProofLine works</h1>
        <p className="mt-1 text-slate-700">
          ProofLine is built around one rule: <strong>no claim goes live without a source.</strong> It reviews a draft before publication, explains each issue, and keeps a human in
          charge of the final decision.
        </p>
      </div>

      <Card title="The check has two stages">
        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            <strong>Rules (no AI).</strong> Plain code checks the text against the brand guidelines: banned terms and shouting (G-1), absolutes and guarantees (G-3), medical or
            cure wording (G-4), and the required disclaimer (G-5). The same text always gives the same result.
          </li>
          <li>
            <strong>Claims against facts.</strong> Every factual claim (numbers, rankings, proof, comparisons) must match an approved fact that is still in date (G-2, G-6). When an AI
            key is configured, a language model proposes the claims and which fact they match. <strong>Code then verifies it</strong>: the quoted words must really be in the draft, the fact
            must really exist, and an expired fact can never make a claim “supported”. If the AI is off, slow or over its limit, a keyword matcher does the job instead, and each finding
            says which method produced it.
          </li>
        </ol>
      </Card>

      <Card title="What a person can trust, and what they must still decide">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Every finding shows the exact words, the reason, and the guideline or fact behind it.</li>
          <li>Suggested fixes are only suggestions. Nothing changes until the author applies one, and each change is a new revision.</li>
          <li>The author can dispute a finding with a reason. The reviewer sees that reason before deciding.</li>
          <li>
            Only a reviewer can approve. ProofLine never approves, publishes or sends anything by itself, and it does not give legal advice. Rules and facts are only as good as the
            ones the brand team keeps up to date.
          </li>
          <li>Every check, AI request, decision and approval is written to the audit trail.</li>
        </ul>
      </Card>

      <Card title="Confidentiality and AI disclosure">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>All data in this demo is fictional. Please do not paste real confidential copy into it.</li>
          <li>Drafts are tied to your browser session and are not shown to other visitors. The guidelines and facts are shared demo records.</li>
          <li>
            When AI is on, only the draft text and the list of approved facts are sent to the AI provider, with no names or accounts. The AI key stays on the server and is never sent to your browser.
          </li>
          <li>
            This project was built by one participant with AI assistance (Claude by Anthropic) for writing code, and uses a Gemini-family model for claim extraction when configured. The
            check rules, the verification logic and the review workflow are the product itself.
          </li>
        </ul>
      </Card>

      <Card title="This deployment">
        <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Data store</dt>
            <dd>{getStore().mode === "supabase" ? "Supabase (Postgres)" : "In-memory demo store"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">AI claim check</dt>
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
