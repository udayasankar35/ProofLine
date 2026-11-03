import { requireUser } from "@/lib/session";
import NewDraftForm from "@/app/components/NewDraftForm";
import { Card, ErrorBanner } from "@/app/components/ui";

export const metadata = { title: "New draft" };

export const maxDuration = 120;

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string }> }) {
  await requireUser(["creator"]);
  const { error, tab } = await searchParams;
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
        <NewDraftForm initialMode={tab === "file" ? "file" : "text"} />
      </Card>
    </div>
  );
}
