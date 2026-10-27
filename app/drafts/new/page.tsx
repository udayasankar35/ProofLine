import { requireUser } from "@/lib/session";
import NewDraftForm from "@/app/components/NewDraftForm";
import { Card, ErrorBanner } from "@/app/components/ui";

export const maxDuration = 60;

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(["creator"]);
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-navy">New draft</h1>
        <p className="text-sm text-slate-600">
          ProofLine checks the text against the approved guidelines and facts, and shows every finding with its source. Nothing is published from here.
        </p>
      </div>
      <ErrorBanner message={error} />
      <Card>
        <NewDraftForm />
      </Card>
    </div>
  );
}
