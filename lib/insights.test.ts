// These tests must never touch a real database, even where the build has Supabase variables set (as on Vercel).
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSampleHistory, removeSampleHistory } from "./history";
import { computeInsights, fmtHours } from "./insights";
import { ensureWorkspace } from "./store";

const session = () => `test-${Math.random().toString(36).slice(2)}`;

test("an empty workspace gives zeros and empty lists, not errors", async () => {
  const s = session();
  await ensureWorkspace(s);
  const i = await computeInsights(s, false);
  assert.equal(i.drafts.total, 0);
  assert.deepEqual(i.topRules, []);
  assert.deepEqual(i.disputes, []);
  assert.equal(i.approval.count, 0);
  assert.equal(i.approval.medianH, null);
  assert.ok(i.facts.length > 0, "facts about to expire come from the knowledge base, so they exist even with no drafts");
});

test("sample history is generated from the real rule engine, is idempotent and can be removed", async () => {
  const s = session();
  await ensureWorkspace(s);
  const added = await loadSampleHistory(s);
  assert.ok(added >= 10, `only ${added} sample drafts`);
  assert.equal(await loadSampleHistory(s), 0, "loading twice adds nothing");

  const all = await computeInsights(s, false);
  assert.equal(all.drafts.total, added);
  assert.equal(all.drafts.sample, added);
  assert.ok(all.drafts.approved > 0);
  assert.ok(all.topRules.length > 0);
  for (let i = 1; i < all.topRules.length; i++) assert.ok(all.topRules[i - 1].drafts >= all.topRules[i].drafts, "most-triggered rules are sorted");
  assert.ok(all.approval.count > 0 && all.approval.medianH !== null && all.approval.medianH >= 0);
  assert.ok(all.approval.fastestH! <= all.approval.medianH! && all.approval.medianH! <= all.approval.slowestH!);

  const mine = await computeInsights(s, true);
  assert.equal(mine.drafts.total, 0, "'only my drafts' leaves the sample out");
  assert.equal(mine.drafts.sample, added, "but still knows it is there");

  assert.equal(await removeSampleHistory(s), added);
  const after = await computeInsights(s, false);
  assert.equal(after.drafts.total, 0);
  assert.equal(await removeSampleHistory(s), 0, "removing twice is harmless");
});

test("sample history is private to its session", async () => {
  const a = session();
  const b = session();
  await ensureWorkspace(a);
  await ensureWorkspace(b);
  await loadSampleHistory(a);
  assert.equal((await computeInsights(b, false)).drafts.total, 0);
});

test("facts are listed soonest-first with a state, and expired facts are flagged", async () => {
  const s = session();
  await ensureWorkspace(s);
  const { facts } = await computeInsights(s, false);
  for (let i = 1; i < facts.length; i++) assert.ok(facts[i - 1].expires_on <= facts[i].expires_on);
  const f07 = facts.find((f) => f.id === "F-07")!;
  assert.equal(f07.state, "expired");
  assert.ok(f07.days < 0);
});

test("fmtHours reads naturally", () => {
  assert.equal(fmtHours(null), "n/a");
  assert.match(fmtHours(0.2), /min/);
  assert.match(fmtHours(5), /h/);
  assert.match(fmtHours(50), /days/);
});
