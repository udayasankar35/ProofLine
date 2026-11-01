import { db } from "@/lib/store";
import type { Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Anonymous feedback summary (no session ids). Open /api/feedback to see how testers rated the demo. */
export async function GET() {
  try {
    const store = await db();
    const rows = await store.select<Feedback>("feedback", undefined, { col: "created_at", asc: false });
    const n = rows.length;
    const avg = n ? rows.reduce((a, r) => a + r.ease, 0) / n : null;
    const done = { yes: 0, partly: 0, no: 0 } as Record<string, number>;
    for (const r of rows) done[r.completed] = (done[r.completed] ?? 0) + 1;
    return Response.json(
      {
        responses: n,
        averageEase: avg === null ? null : Math.round(avg * 10) / 10,
        completedWithoutHelp: done,
        comments: rows.filter((r) => r.confusing || r.wanted).slice(0, 60).map((r) => ({ at: r.created_at, role: r.role, ease: r.ease, completed: r.completed, confusing: r.confusing, wanted: r.wanted })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 200) : "failed" }, { status: 500 });
  }
}
