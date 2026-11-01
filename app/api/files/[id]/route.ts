import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { db } from "@/lib/store";
import type { DraftFile } from "@/lib/types";

export const dynamic = "force-dynamic";

const SAFE = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

/** Serves an uploaded original back to the session that uploaded it (and nobody else). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return new Response("Not found", { status: 404 });
  const store = await db();
  const f = await store.get<DraftFile>("draft_files", id);
  if (!f || f.session_id !== session || !SAFE.has(f.mime)) return new Response("Not found", { status: 404 });
  const inline = f.mime.startsWith("image/") || f.mime === "application/pdf";
  const safeName = f.name.replace(/[^\w.\- ]+/g, "_");
  return new Response(Buffer.from(f.data, "base64"), {
    headers: {
      "content-type": f.mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "cache-control": "private, no-store",
    },
  });
}
