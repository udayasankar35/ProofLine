import { after } from "next/server";
import { aiConfigured, aiModel, aiProvider, extractClaims } from "@/lib/ai";
import { FACTS } from "@/lib/seed";
import { db, getStore, newId, nowIso } from "@/lib/store";
import type { AuditEntry } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let lastAiTest = 0;

const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

/**
 * Setup check. Open /api/health to see whether the database is reachable and seeded.
 * Open /api/health?ai=1 to make one tiny AI call and see whether the key and model work.
 * It never returns a key or any user data.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const out: Record<string, unknown> = {
    app: "ProofLine",
    time: new Date().toISOString(),
    store: getStore().mode,
  };

  try {
    const s = await db();
    out.database = {
      ok: true,
      guidelines: await s.count("guidelines"),
      facts: await s.count("facts"),
      terms: await s.count("terms"),
    };
  } catch (e) {
    out.database = { ok: false, error: short(e), hint: "Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and that supabase/schema.sql was run." };
  }

  const ai: Record<string, unknown> = { configured: aiConfigured(), provider: aiProvider(), model: aiModel() };
  const mode = url.searchParams.get("ai");
  if (mode === "1") {
    if (!aiConfigured()) {
      ai.test = { ok: false, error: "AI_API_KEY is not set, so ProofLine runs in rules-only mode." };
    } else if (Date.now() - lastAiTest < 30_000) {
      ai.test = { ok: false, error: "Please wait 30 seconds between AI tests." };
    } else {
      lastAiTest = Date.now();
      // Run in the background so this page answers at once; open ?ai=last a few seconds later for the result.
      after(async () => {
        const t0 = Date.now();
        let result: Record<string, unknown>;
        try {
          const claims = await Promise.race([
            extractClaims("AquaPulse is the #1 sports drink in India.", FACTS),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("No reply from the AI within 40 seconds")), 40_000)),
          ]);
          result = { ok: true, claimsReturned: claims.length, ms: Date.now() - t0 };
        } catch (e) {
          result = { ok: false, error: short(e), ms: Date.now() - t0 };
        }
        try {
          const s = await db();
          await s.insert("audit_log", {
            id: newId("H-"), session_id: "health", draft_id: "", actor_name: "health", actor_role: "system",
            action: "ai_health", detail: JSON.stringify(result), created_at: nowIso(),
          });
        } catch {
          /* ignore */
        }
      });
      ai.test = { started: true, next: "Open /api/health?ai=last in about 15 seconds to read the result." };
    }
  } else if (mode === "last") {
    try {
      const s = await db();
      const rows = await s.select<AuditEntry>("audit_log", { action: "ai_health" }, { col: "created_at", asc: false });
      ai.test = rows[0] ? { at: rows[0].created_at, ...JSON.parse(rows[0].detail) } : { note: "No AI test has finished yet." };
    } catch (e) {
      ai.test = { ok: false, error: short(e) };
    }
  }
  out.ai = ai;
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
