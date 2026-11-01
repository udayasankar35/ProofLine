import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { db } from "@/lib/store";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Downloads the current (corrected) text of a draft as a plain text file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const store = await db();
  const d = session ? await store.get<Draft>("drafts", id) : null;
  if (!d || d.session_id !== session) return new Response("Not found", { status: 404 });
  const name = d.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "draft";
  return new Response(d.body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-revision-${d.rev}.txt"`,
      "cache-control": "private, no-store",
    },
  });
}
