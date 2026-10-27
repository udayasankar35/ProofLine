import { addFact, addTerm, resetKnowledge, setFactExpiry } from "../actions";
import SubmitButton from "../components/SubmitButton";
import { Card, ErrorBanner, btnDanger, btnPrimary, btnSecondary, inputCls } from "../components/ui";
import { requireUser } from "@/lib/session";
import { db, todayIso } from "@/lib/store";
import type { Disclaimer, Fact, Guideline, Term } from "@/lib/types";

function factState(f: Fact, today: string): { label: string; cls: string } {
  if (f.expires_on < today) return { label: "Expired", cls: "border-red-300 bg-red-50 text-red-800" };
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 60);
  if (f.expires_on <= soon.toISOString().slice(0, 10)) return { label: "Expires soon", cls: "border-amber-300 bg-amber-50 text-amber-800" };
  return { label: "In date", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" };
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await requireUser();
  const { error } = await searchParams;
  const store = await db();
  const [guidelines, facts, terms, disclaimers] = await Promise.all([
    store.select<Guideline>("guidelines", undefined, { col: "id" }),
    store.select<Fact>("facts", undefined, { col: "id" }),
    store.select<Term>("terms", undefined, { col: "id" }),
    store.select<Disclaimer>("disclaimers", undefined, { col: "id" }),
  ]);
  const today = todayIso();
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Guidelines & approved facts</h1>
        <p className="text-sm text-slate-600">
          This is what every draft is checked against. A claim is only “supported” by a fact that is still in date.
          {isAdmin ? " You can edit facts and terms here." : " Switch to Asha (Admin) to edit."}
        </p>
        <p className="mt-1 text-xs text-slate-500">These demo records are shared by all visitors. The admin can restore the original set at any time.</p>
      </div>
      <ErrorBanner message={error} />

      <Card title="Brand guidelines">
        <ul className="space-y-3 text-sm">
          {guidelines.map((g) => (
            <li key={g.id}>
              <p>
                <span className="mr-2 rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{g.id}</span>
                <span className="font-medium text-navy">{g.title}</span>
              </p>
              <p className="mt-0.5 text-slate-700">{g.text}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Approved facts (${facts.length})`}>
        <ul className="space-y-3">
          {facts.map((f) => {
            const st = factState(f, today);
            return (
              <li key={f.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{f.id}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  <span className="text-xs text-slate-500">valid until {f.expires_on}</span>
                </div>
                <p className="mt-1 text-slate-900">{f.statement}</p>
                <p className="text-xs text-slate-500">
                  Source: {f.source} · Owner: {f.owner}
                </p>
                {isAdmin ? (
                  <form action={setFactExpiry} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="fact_id" value={f.id} />
                    <div>
                      <label htmlFor={`exp-${f.id}`} className="block text-xs text-slate-600">
                        Valid until
                      </label>
                      <input id={`exp-${f.id}`} type="date" name="expires_on" defaultValue={f.expires_on} required className={`${inputCls} w-44`} />
                    </div>
                    <SubmitButton className={btnSecondary}>Update date</SubmitButton>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
        {isAdmin ? (
          <details className="mt-4 rounded border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Add an approved fact</summary>
            <form action={addFact} className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="statement" className="mb-1 block text-xs font-medium text-slate-700">
                  Statement the brand may make
                </label>
                <input id="statement" name="statement" required maxLength={300} className={inputCls} />
              </div>
              <div>
                <label htmlFor="source" className="mb-1 block text-xs font-medium text-slate-700">
                  Source document
                </label>
                <input id="source" name="source" required maxLength={200} className={inputCls} />
              </div>
              <div>
                <label htmlFor="owner" className="mb-1 block text-xs font-medium text-slate-700">
                  Owner
                </label>
                <input id="owner" name="owner" maxLength={100} className={inputCls} />
              </div>
              <div>
                <label htmlFor="expires_on" className="mb-1 block text-xs font-medium text-slate-700">
                  Valid until
                </label>
                <input id="expires_on" name="expires_on" type="date" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="keywords" className="mb-1 block text-xs font-medium text-slate-700">
                  Keywords (comma separated, used when AI is off)
                </label>
                <input id="keywords" name="keywords" maxLength={200} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton className={btnPrimary}>Add fact</SubmitButton>
              </div>
            </form>
          </details>
        ) : null}
      </Card>

      <Card title="Terms to avoid">
        <ul className="space-y-2 text-sm">
          {terms.map((t) => (
            <li key={t.id}>
              <span className="mr-2 rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{t.id}</span>
              <strong>“{t.term}”</strong> → {t.replacement ? `“${t.replacement}”` : "remove"} <span className="text-slate-500">· {t.reason}</span>
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <details className="mt-4 rounded border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Add a term to avoid</summary>
            <form action={addTerm} className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-3">
              <div>
                <label htmlFor="term" className="mb-1 block text-xs font-medium text-slate-700">
                  Word or phrase to avoid
                </label>
                <input id="term" name="term" required maxLength={60} className={inputCls} />
              </div>
              <div>
                <label htmlFor="replacement" className="mb-1 block text-xs font-medium text-slate-700">
                  Use instead (blank to remove)
                </label>
                <input id="replacement" name="replacement" maxLength={60} className={inputCls} />
              </div>
              <div>
                <label htmlFor="reason" className="mb-1 block text-xs font-medium text-slate-700">
                  Why
                </label>
                <input id="reason" name="reason" maxLength={200} className={inputCls} />
              </div>
              <div className="sm:col-span-3">
                <SubmitButton className={btnPrimary}>Add term</SubmitButton>
              </div>
            </form>
          </details>
        ) : null}
      </Card>

      <Card title="Required disclaimer">
        {disclaimers.map((d) => (
          <div key={d.id} className="text-sm">
            <p>
              <span className="mr-2 rounded bg-tint px-1.5 py-0.5 font-mono text-xs text-teal">{d.id}</span>
              Required when the text uses: <span className="text-slate-600">{d.triggers.split(",").join(", ")}</span>
            </p>
            <p className="mt-1 text-slate-800">“{d.text}”</p>
          </div>
        ))}
      </Card>

      {isAdmin ? (
        <form action={resetKnowledge}>
          <SubmitButton className={btnDanger} pending="Restoring…">
            Restore the original demo guidelines, facts and terms
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
