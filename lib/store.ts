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
  | "audit_log";

type Row = Record<string, unknown>;
type Where = Record<string, string | number | boolean>;

export interface Store {
  mode: "memory" | "supabase";
  select<T>(table: Table, where?: Where, order?: { col: string; asc?: boolean }): Promise<T[]>;
  get<T>(table: Table, id: string): Promise<T | null>;
  insert(table: Table, rows: Row | Row[]): Promise<void>;
  insertIgnore(table: Table, rows: Row[]): Promise<void>;
  update(table: Table, id: string, patch: Row): Promise<void>;
  deleteWhere(table: Table, where: Where): Promise<void>;
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
  async select<T>(table: Table, where?: Where, order?: { col: string; asc?: boolean }) {
    let out = this.rows(table).filter((r) => this.match(r, where));
    if (order) {
      const { col, asc = true } = order;
      out = [...out].sort((a, b) => {
        const x = String(a[col] ?? "");
        const y = String(b[col] ?? "");
        return asc ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    return out.map((r) => ({ ...r })) as T[];
  }
  async get<T>(table: Table, id: string) {
    const r = this.rows(table).find((x) => x.id === id);
    return r ? ({ ...r } as T) : null;
  }
  async insert(table: Table, rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    this.rows(table).push(...list.map((r) => ({ ...r })));
  }
  async insertIgnore(table: Table, rows: Row[]) {
    const have = new Set(this.rows(table).map((r) => r.id));
    for (const r of rows) if (!have.has(r.id)) this.rows(table).push({ ...r });
  }
  async update(table: Table, id: string, patch: Row) {
    const r = this.rows(table).find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async deleteWhere(table: Table, where: Where) {
    this.data.set(
      table,
      this.rows(table).filter((r) => !this.match(r, where)),
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
  async select<T>(table: Table, where?: Where, order?: { col: string; asc?: boolean }) {
    let q = this.sb.from(table).select("*");
    for (const [k, v] of Object.entries(where ?? {})) q = q.eq(k, v);
    if (order) q = q.order(order.col, { ascending: order.asc ?? true });
    const { data, error } = await q;
    if (error) this.fail(table, "read", error.message);
    return (data ?? []) as T[];
  }
  async get<T>(table: Table, id: string) {
    const { data, error } = await this.sb.from(table).select("*").eq("id", id).maybeSingle();
    if (error) this.fail(table, "read", error.message);
    return (data as T) ?? null;
  }
  async insert(table: Table, rows: Row | Row[]) {
    const { error } = await this.sb.from(table).insert(rows);
    if (error) this.fail(table, "insert", error.message);
  }
  async insertIgnore(table: Table, rows: Row[]) {
    const { error } = await this.sb.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) this.fail(table, "insert", error.message);
  }
  async update(table: Table, id: string, patch: Row) {
    const { error } = await this.sb.from(table).update(patch).eq("id", id);
    if (error) this.fail(table, "update", error.message);
  }
  async deleteWhere(table: Table, where: Where) {
    let q = this.sb.from(table).delete();
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
    const { error } = await q;
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

export async function seedKnowledge(store: Store) {
  await store.insertIgnore("users", USERS as unknown as Row[]);
  await store.insertIgnore("guidelines", GUIDELINES as unknown as Row[]);
  await store.insertIgnore("facts", FACTS as unknown as Row[]);
  await store.insertIgnore("terms", TERMS as unknown as Row[]);
  await store.insertIgnore("disclaimers", DISCLAIMERS as unknown as Row[]);
}

/** Returns the store after making sure the demo knowledge base exists. */
export async function db(): Promise<Store> {
  const store = getStore();
  if (!g.__plSeeded) {
    g.__plSeeded = (async () => {
      if ((await store.count("guidelines")) === 0) await seedKnowledge(store);
    })().catch((e) => {
      g.__plSeeded = undefined;
      throw e;
    });
  }
  await g.__plSeeded;
  return store;
}

export async function resetKnowledge() {
  const store = getStore();
  for (const t of ["guidelines", "facts", "terms", "disclaimers"] as Table[]) {
    // delete every row: filter on a column that always differs from the sentinel
    const rows = await store.select<{ id: string }>(t);
    for (const r of rows) await store.deleteWhere(t, { id: r.id });
  }
  await seedKnowledge(store);
}

export const newId = (prefix = "") =>
  prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);
