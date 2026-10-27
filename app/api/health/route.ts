import { aiConfigured, aiModel, aiProvider, extractClaims } from "@/lib/ai";
import { FACTS } from "@/lib/seed";
import { db, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

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
  if (url.searchParams.get("ai") === "1") {
    if (!aiConfigured()) {
      ai.test = { ok: false, error: "AI_API_KEY is not set, so ProofLine runs in rules-only mode." };
    } else if (Date.now() - lastAiTest < 30_000) {
      ai.test = { ok: false, error: "Please wait 30 seconds between AI tests." };
    } else {
      lastAiTest = Date.now();
      try {
        const claims = await extractClaims("AquaPulse is the #1 sports drink in India.", FACTS);
        ai.test = { ok: true, claimsReturned: claims.length };
      } catch (e) {
        ai.test = { ok: false, error: short(e) };
      }
    }
  }
  out.ai = ai;
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
