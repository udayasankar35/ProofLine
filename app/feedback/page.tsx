import { submitFeedback } from "@/app/extra-actions";
import SubmitButton from "@/app/components/SubmitButton";
import { Card, ErrorBanner, NoticeBanner, btnPrimary, inputCls } from "@/app/components/ui";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Give feedback" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-navy">Tell us how it went</h1>
        <p className="text-sm text-slate-600">Two minutes, no name needed. Your answers are anonymous and help the builder fix what confused you.</p>
      </div>
      <ErrorBanner message={error} />
      <NoticeBanner message={notice} />
      {user ? (
        <Card>
          <form action={submitFeedback} className="space-y-5">
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-800">Could you check a draft, fix the problems and get it approved without help?</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  ["yes", "Yes"],
                  ["partly", "Partly"],
                  ["no", "No"],
                ].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="completed" value={v} required /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-800">How easy was it? (1 = very hard, 5 = very easy)</legend>
              <div className="flex gap-4 text-sm">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex items-center gap-1">
                    <input type="radio" name="ease" value={n} required /> {n}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="confusing" className="mb-1 block text-sm font-medium text-slate-800">
                What was confusing or slow? <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <textarea id="confusing" name="confusing" rows={3} maxLength={600} className={inputCls} />
            </div>
            <div>
              <label htmlFor="wanted" className="mb-1 block text-sm font-medium text-slate-800">
                What did you expect that was missing? <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <textarea id="wanted" name="wanted" rows={3} maxLength={600} className={inputCls} />
            </div>
            <SubmitButton className={btnPrimary} pending="Sending…">
              Send feedback
            </SubmitButton>
          </form>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-700">Try the demo first (pick a role on the home page), then come back here to tell us how it went.</p>
        </Card>
      )}
    </div>
  );
}
