import { BRAND_PALETTE } from "./seed";
import { guidelineText, type RawFinding } from "./rules";
import type { Guideline, SourceType, VisualInfo } from "./types";

export function parseVisual(json: string): VisualInfo | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as VisualInfo;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

// ---- colour maths (WCAG 2.x relative luminance and contrast ratio) -------------------------

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. Null if either colour is not a valid hex code. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Perceptual colour distance (CIE76 delta E). About 2 is just noticeable; above 25 is clearly a different colour. */
export function deltaE(a: string, b: string): number | null {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return null;
  const [l1, a1, b1] = toLab(x);
  const [l2, a2, b2] = toLab(y);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/** White, black and greys are always allowed in the brand palette. */
export function isNeutral(hex: string): boolean {
  const c = parseHex(hex);
  if (!c) return true;
  const max = Math.max(...c);
  const min = Math.min(...c);
  return max === 0 || (max - min) / max < 0.12;
}

export const OFF_PALETTE_DELTA = 28;
export const SMALL_TEXT_PCT = 2;
export const LARGE_TEXT_PCT = 5;

/** Alt text that tells a screen-reader user nothing. Returns the problem, or null when it is fine. */
export function altTextProblem(alt: string): string | null {
  const a = alt.trim();
  if (!a) return "No alt text has been written for this image.";
  if (a.length < 8) return "The alt text is too short to describe the image.";
  if (/\.(png|jpe?g|webp|gif|pdf|docx?)$/i.test(a) || /^(img|image|dsc|screenshot|photo)[-_ ]?\d+/i.test(a)) {
    return "The alt text looks like a file name, not a description.";
  }
  if (/^(an? |the )?(image|photo|picture|graphic|banner|poster|logo|screenshot|creative|post)( of)?$/i.test(a)) {
    return "The alt text only says what kind of file this is. Describe what the image shows.";
  }
  return null;
}

/**
 * Accessibility and visual-identity findings (G-7) for an uploaded file.
 * Alt-text findings come from code. Contrast, size and palette findings rely on what the vision model
 * estimated from the picture, so they are labelled "needs a human check".
 */
export function visualFindings(args: {
  sourceType: SourceType;
  alt: string;
  visual: VisualInfo | null;
  guidelines: Guideline[];
}): RawFinding[] {
  const { sourceType, alt, visual, guidelines } = args;
  const src = guidelineText(guidelines, "G-7");
  const out: RawFinding[] = [];

  if (sourceType === "image") {
    const problem = altTextProblem(alt);
    if (problem) {
      out.push({
        rule_id: "R-6",
        severity: "high",
        verdict: "rule",
        title: alt.trim() ? "R-6 · Alt text is not descriptive" : "R-6 · Alt text missing",
        quote: alt.trim() || "(no alt text)",
        reason: `${problem} People who use screen readers rely on it. Write one plain sentence that says what the image shows. This is required before the image can go to review.`,
        source_ref: "G-7",
        source_text: src,
        fix_kind: "manual",
        suggestion: "",
        origin: "rule",
        confidence: "high",
        target: "visual",
      });
    }
  }

  if (sourceType === "docx") {
    for (const img of visual?.docx_images ?? []) {
      if (img.alt.trim() || img.decorative) continue;
      out.push({
        rule_id: "R-6",
        severity: "high",
        verdict: "rule",
        title: "R-6 · Image without alt text",
        quote: img.name || "Image in the document",
        reason:
          'This image in the Word file has no alt text. In Word, right-click the image, choose "View Alt Text", describe it (or tick "Mark as decorative"), then use "Upload a new version". If it really is decorative, dispute this finding with a reason.',
        source_ref: "G-7",
        source_text: src,
        fix_kind: "manual",
        suggestion: "",
        origin: "rule",
        confidence: "high",
        target: "visual",
      });
    }
  }

  if (visual?.ai) {
    for (const b of visual.text_blocks ?? []) {
      const ratio = contrastRatio(b.fg, b.bg);
      const large = b.height_pct >= LARGE_TEXT_PCT;
      const need = large ? 3 : 4.5;
      if (ratio !== null && ratio < need) {
        out.push({
          rule_id: "R-7",
          severity: ratio < 2 ? "high" : "medium",
          verdict: "rule",
          title: "R-7 · Low text contrast",
          quote: b.text,
          reason: `The text colour (${b.fg}) on its background (${b.bg}) has an estimated contrast of ${ratio.toFixed(1)}:1. ${large ? "Large text" : "Text"} needs at least ${need}:1 to be readable. The colours were estimated from the picture by an AI model, so check them in your design tool.`,
          source_ref: "G-7",
          source_text: src,
          fix_kind: "manual",
          suggestion: "",
          origin: "vision",
          confidence: "low",
          target: "visual",
        });
      }
      if (b.height_pct > 0 && b.height_pct < SMALL_TEXT_PCT) {
        out.push({
          rule_id: "R-7",
          severity: "low",
          verdict: "rule",
          title: "R-7 · Text may be too small",
          quote: b.text,
          reason: `This text looks about ${b.height_pct.toFixed(1)}% of the image height, below the ${SMALL_TEXT_PCT}% guide. It may be hard to read on a phone. The size was estimated by an AI model, so check it on a real screen.`,
          source_ref: "G-7",
          source_text: src,
          fix_kind: "manual",
          suggestion: "",
          origin: "vision",
          confidence: "low",
          target: "visual",
        });
      }
    }

    const off = (visual.colors ?? [])
      .filter((c) => parseHex(c) && !isNeutral(c))
      .filter((c) => BRAND_PALETTE.every((p) => (deltaE(c, p) ?? 99) > OFF_PALETTE_DELTA));
    if (off.length > 0) {
      out.push({
        rule_id: "R-8",
        severity: "low",
        verdict: "rule",
        title: "R-8 · Colours outside the brand palette",
        quote: off.join(", "),
        reason: `The AI model saw ${off.length === 1 ? "a dominant colour" : "dominant colours"} (${off.join(", ")}) that ${off.length === 1 ? "is" : "are"} not close to the AquaPulse palette (${BRAND_PALETTE.join(", ")}). Colours were estimated from the picture, so a designer should confirm.`,
        source_ref: "G-7",
        source_text: src,
        fix_kind: "manual",
        suggestion: "",
        origin: "vision",
        confidence: "low",
        target: "visual",
      });
    }
  }
  return out;
}
