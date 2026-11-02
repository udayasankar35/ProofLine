import { after } from "next/server";
import { aiConfigured, aiModel, aiProvider, extractClaims, readWithVision } from "@/lib/ai";
import { SAMPLE_FILES } from "@/lib/sample-files";
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

  if (url.searchParams.get("check") === "schema") {
    // Confirms the Round 3 database migration was applied: every new table and column must be readable.
    const checks: Array<[string, string]> = [
      ["draft_files", "id,draft_id,session_id,name,mime,size,data,created_at"],
      ["ledger_entries", "id,session_id,draft_id,rev,claim,kind,basis,fact_id,fact_statement,fact_source,fact_owner,fact_expires_on,verdict,note,approved_by,approved_at,status,status_note,checked_at"],
      ["finding_events", "id,session_id,draft_id,rev,rule_id,severity,verdict,origin,created_at"],
      ["eval_runs", "id,kind,model,session_id,started_at,finished_at,status,total,done,metrics,details"],
      ["feedback", "id,session_id,role,completed,ease,confusing,wanted,created_at"],
      ["drafts", "source_type,source_name,alt_text,extract_note,visual,is_sample,submitted_at,approved_at,approved_by"],
      ["findings", "confidence,target"],
      ["facts", "ws,id"],
      ["guidelines", "ws,id"],
      ["terms", "ws,id"],
      ["disclaimers", "ws,id"],
    ];
    const s = await db().catch(() => null);
    const result: Record<string, string> = {};
    for (const [table, cols] of checks) {
      try {
        if (!s) throw new Error("database not reachable");
        await Promise.race([
          s.select(table as never, undefined, undefined, cols, 1),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timed out after 8 seconds")), 8000)),
        ]);
        result[table] = "ok";
      } catch (e) {
        result[table] = short(e);
      }
    }
    out.schema = { ok: Object.values(result).every((v) => v === "ok"), tables: result };
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
          const r = await Promise.race([
            extractClaims("AquaPulse is the #1 sports drink in India.", FACTS),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("No reply from the AI within 40 seconds")), 40_000)),
          ]);
          result = { ok: true, claimsReturned: r.claims.length, modelUsed: r.model, ms: Date.now() - t0 };
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
  } else if (mode === "vision") {
    if (!aiConfigured()) {
      ai.test = { ok: false, error: "AI_API_KEY is not set." };
    } else if (Date.now() - lastAiTest < 30_000) {
      ai.test = { ok: false, error: "Please wait 30 seconds between AI tests." };
    } else {
      lastAiTest = Date.now();
      after(async () => {
        const t0 = Date.now();
        let result: Record<string, unknown>;
        try {
          const f = SAMPLE_FILES.find((x) => x.id === "tile")!;
          const r = await readWithVision(Buffer.from(f.base64, "base64"), f.mime);
          result = {
            kind: "vision",
            ok: true,
            modelUsed: r.model,
            ms: Date.now() - t0,
            textLines: r.text.split("\n").filter(Boolean).length,
            textHasCures: /cures fatigue/i.test(r.text),
            textBlocks: r.text_blocks.length,
            colors: r.colors,
            suggestedAlt: r.suggested_alt,
            blocks: r.text_blocks,
          };
        } catch (e) {
          result = { kind: "vision", ok: false, error: short(e), ms: Date.now() - t0 };
        }
        try {
          const s = await db();
          await s.insert("audit_log", { id: newId("H-"), session_id: "health", draft_id: "", actor_name: "health", actor_role: "system", action: "ai_health", detail: JSON.stringify(result), created_at: nowIso() });
        } catch {
          /* ignore */
        }
      });
      ai.test = { started: true, next: "Open /api/health?ai=last in about 20 seconds to read the result." };
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
