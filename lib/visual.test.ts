import assert from "node:assert/strict";
import { test } from "node:test";
import { GUIDELINES } from "./seed";
import type { VisualInfo } from "./types";
import { altTextProblem, contrastRatio, deltaE, isNeutral, parseVisual, visualFindings } from "./visual";

const findings = (over: Partial<Parameters<typeof visualFindings>[0]>) => visualFindings({ sourceType: "image", alt: "A navy tile reading AquaPulse", visual: null, guidelines: GUIDELINES, ...over });

test("contrast ratio follows the WCAG formula", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")! * 10) / 10, 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  const r = contrastRatio("#767676", "#FFFFFF")!; // the classic 4.5:1 grey
  assert.ok(r > 4.4 && r < 4.6, String(r));
  assert.equal(contrastRatio("not a colour", "#FFFFFF"), null);
  assert.equal(contrastRatio("#FFF", "#000")! > 20, true); // short hex works
});

test("alt text: missing, too short, file names and generic words are not descriptions", () => {
  assert.ok(altTextProblem(""));
  assert.ok(altTextProblem("   "));
  assert.ok(altTextProblem("logo"));
  assert.ok(altTextProblem("IMG_2043.png"));
  assert.ok(altTextProblem("screenshot 12"));
  assert.ok(altTextProblem("image"));
  assert.equal(altTextProblem("A navy tile with the words AquaPulse and a lime band"), null);
});

test("an image without alt text is a high finding that blocks review (R-6)", () => {
  const f = findings({ alt: "" });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule_id, "R-6");
  assert.equal(f[0].severity, "high");
  assert.equal(findings({}).length, 0);
});

test("a Word file with an undescribed picture gets R-6, a decorative one does not", () => {
  const visual: VisualInfo = { kind: "docx", ai: false, docx_images: [{ name: "Picture 1", alt: "", decorative: false }, { name: "Picture 2", alt: "", decorative: true }, { name: "Picture 3", alt: "A can of AquaPulse", decorative: false }] };
  const f = findings({ sourceType: "docx", alt: "", visual });
  assert.equal(f.length, 1);
  assert.equal(f[0].quote, "Picture 1");
});

test("vision estimates: low contrast, small text and off-palette colours are flagged as low-confidence AI findings", () => {
  const visual: VisualInfo = {
    kind: "image",
    ai: true,
    text_blocks: [
      { text: "Terms apply", height_pct: 1.5, fg: "#F3A6CF", bg: "#FF2D95" },
      { text: "AquaPulse", height_pct: 9, fg: "#FFFFFF", bg: "#0B2545" },
    ],
    colors: ["#0B2545", "#FF2D95", "#FFFFFF"],
  };
  const f = findings({ visual });
  const rules = f.map((x) => x.rule_id);
  assert.ok(rules.includes("R-7") && rules.includes("R-8"));
  for (const x of f) {
    assert.equal(x.origin, "vision");
    assert.equal(x.confidence, "low");
  }
  assert.ok(f.some((x) => x.title.includes("contrast") && x.quote === "Terms apply"));
  assert.ok(f.some((x) => x.title.includes("too small")));
  assert.ok(!f.some((x) => x.quote === "AquaPulse"), "the good text block must not be flagged");
});

test("large text only needs 3:1 contrast", () => {
  // about 3.5:1: fails for normal text, passes for large text
  const block = (height_pct: number) => ({ kind: "image" as const, ai: true, text_blocks: [{ text: "Big", height_pct, fg: "#8A8A8A", bg: "#FFFFFF" }], colors: [] });
  const ratio = contrastRatio("#8A8A8A", "#FFFFFF")!;
  assert.ok(ratio > 3 && ratio < 4.5, String(ratio));
  assert.ok(findings({ visual: block(3) }).some((x) => x.title.includes("contrast")));
  assert.ok(!findings({ visual: block(8) }).some((x) => x.title.includes("contrast")));
});

test("neutral colours and palette colours are never flagged as off-palette", () => {
  assert.equal(isNeutral("#808080"), true);
  assert.ok((deltaE("#0B2545", "#0B2545") ?? 99) < 1);
  const f = findings({ visual: { kind: "image", ai: true, text_blocks: [], colors: ["#0B2545", "#1B9AAA", "#9BD93C", "#FFFFFF", "#F2F2F2", "#333333"] } });
  assert.equal(f.filter((x) => x.rule_id === "R-8").length, 0);
});

test("without the vision model no visual estimates are produced, only the exact alt-text rule", () => {
  const f = findings({ alt: "", visual: { kind: "image", ai: false } });
  assert.deepEqual(f.map((x) => x.rule_id), ["R-6"]);
});

test("parseVisual survives garbage", () => {
  assert.equal(parseVisual(""), null);
  assert.equal(parseVisual("{not json"), null);
  assert.equal(parseVisual("null"), null);
});
