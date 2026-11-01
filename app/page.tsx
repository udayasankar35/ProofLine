import Link from "next/link";
import { loginAs, signIn } from "./actions";
import { getCurrentUser, homeFor } from "@/lib/session";
import { DEMO_LOGINS, USERS } from "@/lib/seed";
import SubmitButton from "./components/SubmitButton";
import { ErrorBanner, NoticeBanner, btnPrimary, btnSecondary, inputCls } from "./components/ui";

const ROLE_COPY: Record<string, { label: string; what: string }> = {
  creator: {
    label: "Creator",
    what: "Paste a draft. See what is flagged and why. Apply the suggested fixes or dispute one with a reason. Send it for review.",
  },
  reviewer: {
    label: "Reviewer",
    what: "See the flagged issues, the evidence, and any disputes. Approve, or ask for changes. Only a human can approve.",
  },
  admin: {
    label: "Admin",
    what: "Own the approved facts, their expiry dates and the banned terms. Change a fact and watch the verdicts change.",
  },
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const current = await getCurrentUser();
  return (
    <div className="space-y-10">
      <NoticeBanner message={notice} />
      <ErrorBanner message={error} />
      <section className="rounded-xl bg-navy px-6 py-10 text-white sm:px-10">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-200">Brand governance before you publish</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">No claim goes live without a source.</h1>
        <p className="mt-4 max-w-2xl text-base text-slate-200">
          ProofLine checks marketing copy against your approved guidelines and facts before it is published. It explains every issue, points to the rule or the fact
          behind it, suggests a fix, and leaves the final decision to a human reviewer.
        </p>
        {current ? (
          <Link href={homeFor(current.role)} className={`${btnPrimary} mt-6`}>
            Continue as {current.name}
          </Link>
        ) : (
          <p className="mt-6 text-sm text-slate-300">No sign-up needed. Demo accounts and their passwords are shown below: use one click, or type them in.</p>
        )}
      </section>

      <section aria-labelledby="roles">
        <h2 id="roles" className="text-xl font-semibold text-navy">
          Demo accounts
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Three accounts, one for each role. The logins are public on purpose so you can try everything. Everything here is fictional demo data for a sports drink called
          AquaPulse, and your drafts are private to this browser session.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {USERS.map((u) => (
            <form key={u.id} action={loginAs} className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
              <input type="hidden" name="user_id" value={u.id} />
              <p className="text-xs font-semibold uppercase tracking-wide text-teal">{ROLE_COPY[u.role].label}</p>
              <p className="mt-1 text-lg font-semibold text-navy">{u.name}</p>
              <p className="text-sm text-slate-500">{u.title}</p>
              <p className="mt-3 flex-1 text-sm text-slate-700">{ROLE_COPY[u.role].what}</p>
              <dl className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="select-all font-mono">{DEMO_LOGINS[u.id].email}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Password</dt>
                  <dd className="select-all font-mono">{DEMO_LOGINS[u.id].password}</dd>
                </div>
              </dl>
              <SubmitButton className={`${u.role === "creator" ? btnPrimary : btnSecondary} mt-4`} pending="Opening…">
                Enter as {u.name.split(" ")[0]}
              </SubmitButton>
            </form>
          ))}
        </div>
      </section>

      <section id="signin" aria-labelledby="signin-h" className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 id="signin-h" className="text-lg font-semibold text-navy">
          Prefer to type the login?
        </h2>
        <p className="mt-1 text-sm text-slate-600">Use any email and password pair from the cards above.</p>
        <form action={signIn} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-800">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="username" required className={`${inputCls} mt-1`} />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-800">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className={`${inputCls} mt-1`} />
          </div>
          <SubmitButton className={btnPrimary} pending="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="path" className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 id="path" className="text-xl font-semibold text-navy">
          A one-minute walkthrough
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Enter as <strong>Devon</strong>, choose <strong>New draft</strong>, load the sample <em>Instagram caption (risky)</em> and press <strong>Check this draft</strong>.
          </li>
          <li>
            Read the findings. Each one shows the exact words, why they are a problem, and the guideline or approved fact behind it. The “#1” claim is flagged because its
            evidence expired.
          </li>
          <li>
            Apply a suggested fix, and dispute another with a reason. Fixes create a new revision and re-check automatically.
          </li>
          <li>
            When no high-risk finding is left open, send it to review. Switch to <strong>Elena</strong> to approve it or request changes.
          </li>
          <li>
            Switch to <strong>Asha</strong> and change a fact’s expiry date. Re-check the draft and the verdict changes. Every step is in the audit trail.
          </li>
        </ol>
        <p className="mt-4 text-sm text-slate-600">
          Curious how the checking works, and where AI is and is not used? Read <Link href="/about" className="text-teal underline">How it works</Link>.
        </p>
      </section>
    </div>
  );
}
