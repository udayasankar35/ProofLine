import { ensureWorkspace } from "./store";
import type { Disclaimer, Fact, Guideline, Term } from "./types";

export interface Knowledge {
  guidelines: Guideline[];
  facts: Fact[];
  terms: Term[];
  disclaimers: Disclaimer[];
}

/** This session's own guidelines, facts, terms and disclaimers (created from the demo set on first use). */
export async function loadKnowledge(ws: string): Promise<Knowledge> {
  const store = await ensureWorkspace(ws);
  const [guidelines, facts, terms, disclaimers] = await Promise.all([
    store.select<Guideline>("guidelines", { ws }, { col: "id" }),
    store.select<Fact>("facts", { ws }, { col: "id" }),
    store.select<Term>("terms", { ws }, { col: "id" }),
    store.select<Disclaimer>("disclaimers", { ws }, { col: "id" }),
  ]);
  return { guidelines, facts, terms, disclaimers };
}
