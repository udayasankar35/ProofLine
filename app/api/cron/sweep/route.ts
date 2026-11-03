import { cronAllowed, sweepDue } from "@/lib/cron";
import { sweepAllWorkspaces } from "@/lib/ledger";
import { nowIso } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily background check of the evidence ledger (scheduled in vercel.json). Safe to call by hand. */
export async function GET(req: Request) {
  if (!cronAllowed(process.env.CRON_SECRET, req.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  if (!sweepDue()) return Response.json({ ok: true, skipped: "A check ran less than a minute ago.", at: nowIso() });
  try {
    const r = await sweepAllWorkspaces();
    return Response.json({ ok: true, ...r, at: nowIso() });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message.slice(0, 200), at: nowIso() }, { status: 500 });
  }
}
