import assert from "node:assert/strict";
import { test } from "node:test";
import { cronAllowed, sweepDue } from "./cron";
import { sweepAllWorkspaces } from "./ledger";
import { db, ensureWorkspace } from "./store";
import { FACTS } from "./seed";

test("the scheduled check is open when no secret is set, and needs the secret when one is", () => {
  assert.equal(cronAllowed(undefined, null), true);
  assert.equal(cronAllowed("s3cret", "Bearer s3cret"), true);
  assert.equal(cronAllowed("s3cret", "Bearer nope"), false);
  assert.equal(cronAllowed("s3cret", null), false);
});

test("a second call within a minute is skipped", () => {
  assert.equal(sweepDue(1_000_000, 60_000), true);
  assert.equal(sweepDue(1_030_000, 60_000), false);
  assert.equal(sweepDue(1_061_000, 60_000), true);
});

test("the daily sweep re-flags approved pieces in every workspace and clears them again", async () => {
  const store = await db();
  const F04 = FACTS.find((f) => f.id === "F-04")!;
  for (const ws of ["cron-a", "cron-b"]) {
    await ensureWorkspace(ws);
    await store.insert("drafts", { id: `D-${ws}`, session_id: ws, title: "Piece", status: "approved", rev: 1, updated_at: "2026-11-01T00:00:00Z" });
    await store.insert("ledger_entries", { id: `L-${ws}`, session_id: ws, draft_id: `D-${ws}`, rev: 1, fact_id: F04.id, fact_statement: F04.statement, fact_source: F04.source, status: "ok", status_note: "", checked_at: "2026-11-01T00:00:00Z" });
  }
  // nothing wrong yet
  const first = await sweepAllWorkspaces();
  assert.equal(first.reflagged, 0);
  assert.ok(first.workspaces >= 2);
  // the fact in workspace A expires
  await store.updateWhere("facts", { ws: "cron-a", id: F04.id }, { expires_on: "2020-01-01" });
  const second = await sweepAllWorkspaces();
  assert.equal(second.reflagged, 1);
  assert.equal((await store.get<{ status: string }>("drafts", "D-cron-a"))?.status, "reflagged");
  assert.equal((await store.get<{ status: string }>("drafts", "D-cron-b"))?.status, "approved");
  // the date is put back: the flag clears
  await store.updateWhere("facts", { ws: "cron-a", id: F04.id }, { expires_on: "2099-01-01" });
  const third = await sweepAllWorkspaces();
  assert.equal(third.cleared, 1);
  assert.equal((await store.get<{ status: string }>("drafts", "D-cron-a"))?.status, "approved");
  assert.equal(third.failed, 0);
});
