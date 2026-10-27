import { segments } from "@/lib/rules";
import type { Finding } from "@/lib/types";
import { markClass } from "./ui";

export default function HighlightedBody({ body, findings }: { body: string; findings: Finding[] }) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const segs = segments(body, findings);
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-900">
      {segs.map((s, i) => {
        const f = s.findingId ? byId.get(s.findingId) : undefined;
        if (!f) return <span key={i}>{s.text}</span>;
        return (
          <a
            key={i}
            href={`#f-${f.id}`}
            title={`${f.title}`}
            className={`rounded-sm px-0.5 underline decoration-2 underline-offset-2 ${markClass(f)}`}
          >
            {s.text}
          </a>
        );
      })}
    </p>
  );
}
