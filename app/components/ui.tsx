import type { DraftStatus, Finding, Origin, Severity, Verdict } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/status";

const pill = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  supported: { label: "Supported", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  unsupported: { label: "Unsupported", cls: "border-red-300 bg-red-50 text-red-800" },
  outdated: { label: "Outdated evidence", cls: "border-orange-300 bg-orange-50 text-orange-800" },
  rule: { label: "Guideline rule", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  tone: { label: "Tone", cls: "border-slate-300 bg-slate-50 text-slate-700" },
};

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  high: { label: "High risk", cls: "border-red-600 bg-red-600 text-white" },
  medium: { label: "Medium", cls: "border-amber-500 bg-amber-100 text-amber-900" },
  low: { label: "Low", cls: "border-slate-300 bg-white text-slate-600" },
};

const ORIGIN: Record<Origin, string> = {
  rule: "Rule",
  fallback: "Rules-only match",
  ai: "AI-assisted, verified by code",
};

const STATUS_CLS: Record<DraftStatus, string> = {
  draft: "border-slate-300 bg-slate-50 text-slate-700",
  in_review: "border-sky-300 bg-sky-50 text-sky-800",
  changes_requested: "border-orange-300 bg-orange-50 text-orange-800",
  approved: "border-emerald-400 bg-emerald-50 text-emerald-800",
};

export const VerdictBadge = ({ v }: { v: Verdict }) => (
  <span className={`${pill} ${VERDICT[v].cls}`}>{VERDICT[v].label}</span>
);
export const SeverityBadge = ({ s }: { s: Severity }) => (
  <span className={`${pill} ${SEVERITY[s].cls}`}>{SEVERITY[s].label}</span>
);
export const OriginBadge = ({ o }: { o: Origin }) => (
  <span className={`${pill} border-teal/30 bg-tint text-teal`}>{ORIGIN[o]}</span>
);
export const StatusBadge = ({ s }: { s: DraftStatus }) => (
  <span className={`${pill} ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>
);

/** Background used to highlight a finding inside the draft text. */
export function markClass(f: Pick<Finding, "verdict" | "severity" | "decision">): string {
  if (f.decision === "disputed") return "bg-violet-100 text-violet-900 decoration-violet-500";
  if (f.verdict === "supported") return "bg-emerald-100 text-emerald-900 decoration-emerald-600";
  if (f.verdict === "unsupported" || f.verdict === "outdated" || f.severity === "high")
    return "bg-red-100 text-red-900 decoration-red-600";
  return "bg-amber-100 text-amber-900 decoration-amber-600";
}

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-navy">{title}</h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export const btn =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} bg-teal text-white hover:bg-[#0b6362]`;
export const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
export const btnDanger = `${btn} border border-red-300 bg-white text-red-700 hover:bg-red-50`;
export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30";

export function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
