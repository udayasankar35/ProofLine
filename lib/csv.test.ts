import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CSV_ROWS, parseCsv, parseFactsCsv } from "./csv";
import { FACTS } from "./seed";

test("parseCsv handles quotes, commas and line breaks inside quotes, doubled quotes, CRLF and a BOM", () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n,\r\nlast,row');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"\nthere'], ["last", "row"]]);
});

test("parseCsv refuses a quote that never closes", () => {
  assert.throws(() => parseCsv('a,b\n"open,1'), /never closed/);
});

test("the sample file imports cleanly into the demo facts", () => {
  const text = 'statement,source,owner,expires_on,keywords\n"AquaPulse is available in 250 ml and 500 ml bottles.",Product catalogue 2026,Marketing,2027-06-30,"bottle size, 250 ml"\nSecond fact,Doc,,2027-01-31,\n';
  const r = parseFactsCsv(text, FACTS);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].keywords, "bottle size, 250 ml");
    assert.equal(r.rows[1].owner, "Brand team"); // default owner
    assert.equal(r.problems.length, 0);
  }
});

test("column names are matched loosely and in any order", () => {
  const r = parseFactsCsv("Valid until,Fact,Source Document\n2027-05-05,Loose headers work,Doc A\n", []);
  assert.ok(r.ok && r.rows[0].statement === "Loose headers work" && r.rows[0].expires_on === "2027-05-05" && r.rows[0].source === "Doc A");
});

test("a semicolon-separated file (some spreadsheet exports) is read too", () => {
  const r = parseFactsCsv("statement;source;expires_on\nSemi fact;Doc;2027-02-02\n", []);
  assert.ok(r.ok && r.rows.length === 1);
});

test("bad files are refused with a message a person can act on", () => {
  const bad = (t: string) => {
    const r = parseFactsCsv(t, []);
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  assert.match(bad(""), /empty/i);
  assert.match(bad("name,value\nx,y\n"), /Missing: statement, source, expires_on/);
  assert.match(bad("statement,source,expires_on\n"), /no facts/i);
  assert.match(bad("statement,source,expires_on\n\u0000\u0001"), /text file|no facts|Missing/i);
  assert.match(bad("PK\u0000\u0003binary"), /text file/i);
  const many = "statement,source,expires_on\n" + Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => `Fact ${i},Doc,2027-01-01`).join("\n");
  assert.match(bad(many), /limit is 200/);
});

test("bad rows are skipped with the row number and a reason; good rows still import", () => {
  const text = [
    "statement,source,expires_on",
    "Good fact,Doc,2027-01-31",
    "Bad date,Doc,31/01/2027",
    "Impossible date,Doc,2027-02-31",
    ",No statement,2027-01-31",
    "No source,,2027-01-31",
    `${"x".repeat(301)},Doc,2027-01-31`,
    "good fact,Doc,2027-01-31", // repeat inside the file
    FACTS[0].statement + ",Doc,2027-01-31", // already in the knowledge base
  ].join("\n");
  const r = parseFactsCsv(text, FACTS);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.rows.length, 1);
  assert.equal(r.total, 8);
  assert.equal(r.problems.length, 7);
  assert.match(r.problems[0], /^Row 3:.*YYYY-MM-DD/);
  assert.match(r.problems[1], /^Row 4:/);
  assert.ok(r.problems.some((p) => p.startsWith("Row 7:") && /300/.test(p)));
  assert.ok(r.problems.some((p) => p.startsWith("Row 9:") && /already/.test(p)));
});

test("text that looks like a spreadsheet formula is kept as plain text (it is never evaluated)", () => {
  const r = parseFactsCsv('statement,source,expires_on\n"=HYPERLINK(""http://x"")",Doc,2027-01-01\n', []);
  assert.ok(r.ok && r.rows[0].statement.startsWith("=HYPERLINK"));
});
