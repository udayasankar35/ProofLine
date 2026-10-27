"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold text-navy">Something went wrong on our side</h1>
      <p className="mt-2 text-sm text-slate-700">
        Your draft was not lost if it had already been saved. Try the page again. If it keeps happening, go back to the start and re-enter the demo.
      </p>
      <div className="mt-4 flex gap-2">
        <button onClick={reset} className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-[#0b6362]">
          Try again
        </button>
        <a href="/" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
          Back to start
        </a>
      </div>
    </div>
  );
}
