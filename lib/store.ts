import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DISCLAIMERS, FACTS, GUIDELINES, TERMS, USERS } from "./seed";

export type Table =
  | "users"
  | "guidelines"
  | "facts"
  | "terms"
  | "disclaimers"
  | "drafts"
  | "revisions"
  | "findings"
  | "comments"
  | "audit_log"
  | "draft_files"
  | "ledger_entries"
  | "finding_events"
  | "eval_runs"
  | "feedback";

/** Tables whose rows belong to one visitor session's workspace (key is ws + id). */
export const KNOWLEDGE_TABLES: Table[] = ["guidelines", "facts", "terms", "disclaimers"];

type Row = Record<string, unknown>;
type Where = Record<string, string | number | boolean>;

export interface Store {
  mode: "memory" | "supabase";
  select<T>(table: Table, where?: Where, order?: { col: string; asc?: boolean }, cols?: string, limit?: number): Promise<T[]>;
  get<T>(table: Table, id: string): Promise<T | null>;
  /** First row that matches every column in `where` (used for tables keyed by workspace + id). */
  getWhere<T>(table: Table, where: Where): Promise<T | null>;
  insert(table: Table, rows: Row | Row[]): Promise<void>;
  /** Insert, skipping rows whose key already exists. `key` names the unique columns (default "id"). */
  insertIgnore(table: Table, rows: Row[], key?: string): Promise<void>;
  update(table: Table, id: string, patch: Row): Promise<void>;
  updateWhere(table: Table, where: Where, patch: Row): Promise<void>;
  deleteWhere(table: Table, where: Where): Promise<void>;
  /** Delete rows whose text column sorts before `value` (ISO timestamps sort correctly). */
  deleteBefore(table: Table, col: string, value: string): Promise<void>;
  count(table: Table, where?: Where, since?: { col: string; value: string }): Promise<number>;
}

class MemoryStore implements Store {
  mode = "memory" as const;
  private data = new Map<Table, Row[]>();

  private rows(t: Table): Row[] {
    if (!this.data.has(t)) this.data.set(t, []);
    return this.data.get(t)!;
  }
  private match(r: Row, where?: Where) {
    return !where || Object.entries(where).every(([k, v]) => r[k] === v);
  }
  async select<T>(table: Table, where?: Where, order?: { col: string; asc?: boolean }, cols?: string, limit?: number) {
    let out = this.rows(table).filter((r) => this.match(r, where));
    if (order) {
      const { col, asc = true } = order;
      out = [...out].sort((a, b) => {
        const x = String(a[col] ?? "");
        const y = String(b[col] ?? "");
        return asc ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    if (limit !== undefined) out = out.slice(0, limit);
    if (cols) {
      const keep = cols.split(",").map((c) => c.trim());
      return out.map((r) => Object.fromEntries(keep.map((c) => [c, r[c]]))) as T[];
    }
    return out.map((r) => ({ ...r })) as T[];
  }
  async get<T>(table: Table, id: string) {
    const r = this.rows(table).find((x) => x.id === id);
    return r ? ({ ...r } as T) : null;
  }
  async getWhere<T>(table: Table, where: Where) {
    const r = this.rows(table).find((x) => this.match(x, where));
    return r ? ({ ...r } as T) : null;
  }
  async insert(table: Table, rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    this.rows(table).push(...list.map((r) => ({ ...r })));
  }
  async insertIgnore(table: Table, rows: Row[], key = "id") {
    const cols = key.split(",").map((c) => c.trim());
    const k = (r: Row) => cols.map((c) => String(r[c] ?? "")).join("\u0000");
    const have = new Set(this.rows(table).map(k));
    for (const r of rows) {
      if (!have.has(k(r))) {
        this.rows(table).push({ ...r });
        have.add(k(r));
      }
    }
  }
  async update(table: Table, id: string, patch: Row) {
    const r = this.rows(table).find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async updateWhere(table: Table, where: Where, patch: Row) {
    for (const r of this.rows(table)) if (this.match(r, where)) Object.assign(r, patch);
  }
  async deleteWhere(table: Table, where: Where) {
    this.data.set(
      table,
      this.rows(table).filter((r) => !this.match(r, where)),
    );
  }
  async deleteBefore(table: Table, col: string, value: string) {
    this.data.set(
      table,
      this.rows(table).filter((r) => !(String(r[col] ?? "") < value)),
    );
  }
  async count(table: Table, where?: Where, since?: { col: string; value: string }) {
    return this.rows(table).filter(
      (r) => this.match(r, where) && (!since || String(r[since.col]) >= since.value),
    ).length;
  }
}

class SupabaseStore implements Store {
  mode = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  private fail(table: string, op: string, message: string): never {
    throw new Error(`Database ${op} on "${table}" failed: ${message}`);
  }
  async select<T>(table: Table, where?: Where, order?: { col: string; asc?: boolean }, cols?: string, limit?: number) {
    let q = this.sb.from(table).select(cols ?? "*");
    for (const [k, v] of Object.entries(where ?? {})) q = q.eq(k, v);
    if (order) q = q.order(order.col, { ascending: order.asc ?? true });
    if (limit !== undefined) q = q.limit(limit);
    const { data, error } = await q;
    if (error) this.fail(table, "read", error.message);
    return (data ?? []) as unknown as T[];
  }
  async get<T>(table: Table, id: string) {
    const { data, error } = await this.sb.from(table).select("*").eq("id", id).maybeSingle();
    if (error) this.fail(table, "read", error.message);
    return (data as T) ?? null;
  }
  async getWhere<T>(table: Table, where: Where) {
    let q = this.sb.from(table).select("*");
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) this.fail(table, "read", error.message);
    return (data as T) ?? null;
  }
  async insert(table: Table, rows: Row | Row[]) {
    const { error } = await this.sb.from(table).insert(rows);
    if (error) this.fail(table, "insert", error.message);
  }
  async insertIgnore(table: Table, rows: Row[], key = "id") {
    const { error } = await this.sb.from(table).upsert(rows, { onConflict: key, ignoreDuplicates: true });
    if (error) this.fail(table, "insert", error.message);
  }
  async update(table: Table, id: string, patch: Row) {
    const { error } = await this.sb.from(table).update(patch).eq("id", id);
    if (error) this.fail(table, "update", error.message);
  }
  async updateWhere(table: Table, where: Where, patch: Row) {
    let q = this.sb.from(table).update(patch);
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
    const { error } = await q;
    if (error) this.fail(table, "update", error.message);
  }
  async deleteWhere(table: Table, where: Where) {
    let q = this.sb.from(table).delete();
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
    const { error } = await q;
    if (error) this.fail(table, "delete", error.message);
  }
  async deleteBefore(table: Table, col: string, value: string) {
    const { error } = await this.sb.from(table).delete().lt(col, value);
    if (error) this.fail(table, "delete", error.message);
  }
  async count(table: Table, where?: Where, since?: { col: string; value: string }) {
    let q = this.sb.from(table).select("*", { count: "exact", head: true });
    for (const [k, v] of Object.entries(where ?? {})) q = q.eq(k, v);
    if (since) q = q.gte(since.col, since.value);
    const { count, error } = await q;
    if (error) this.fail(table, "count", error.message);
    return count ?? 0;
  }
}

const g = globalThis as unknown as { __plStore?: Store; __plSeeded?: Promise<void> };

function build(): Store {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  }
  return new MemoryStore();
}

export function getStore(): Store {
  if (!g.__plStore) g.__plStore = build();
  return g.__plStore;
}

const withWs = <T extends object>(rows: T[], ws: string) => rows.map((r) => ({ ...r, ws })) as unknown as Row[];

/** Creates this session's own copy of the demo guidelines, facts, terms and disclaimers (skips rows that already exist). */
export async function seedWorkspace(store: Store, ws: string) {
  await store.insertIgnore("guidelines", withWs(GUIDELINES, ws), "ws,id");
  await store.insertIgnore("facts", withWs(FACTS, ws), "ws,id");
  await store.insertIgnore("terms", withWs(TERMS, ws), "ws,id");
  await store.insertIgnore("disclaimers", withWs(DISCLAIMERS, ws), "ws,id");
}

const seededWs = new Set<string>();

/** Makes sure the session's workspace exists. Cheap after the first call in a server instance. */
export async function ensureWorkspace(ws: string): Promise<Store> {
  const store = await db();
  if (!ws || seededWs.has(ws)) return store;
  if ((await store.count("guidelines", { ws })) === 0) await seedWorkspace(store, ws);
  seededWs.add(ws);
  if (seededWs.size > 500) seededWs.clear();
  return store;
}

/** Returns the store, with the demo users present. */
export async function db(): Promise<Store> {
  const store = getStore();
  if (!g.__plSeeded) {
    g.__plSeeded = (async () => {
      await store.insertIgnore("users", USERS as unknown as Row[]);
    })().catch((e) => {
      g.__plSeeded = undefined;
      throw e;
    });
  }
  await g.__plSeeded;
  return store;
}

/** Restores this session's guidelines, facts and terms to the original demo set. */
export async function resetWorkspace(ws: string) {
  const store = await db();
  for (const t of KNOWLEDGE_TABLES) await store.deleteWhere(t, { ws });
  seededWs.delete(ws);
  await ensureWorkspace(ws);
}

export const newId = (prefix = "") =>
  prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);
