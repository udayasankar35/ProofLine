// Prints the rules-only evaluation report. Run: npm run eval  (add --failures to list every wrong case)
import { CLASSES, CLASS_LABEL, runRulesEval } from "../lib/eval/run";

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const { results, metrics: m } = runRulesEval();
console.log(`Cases: ${m.cases} (core ${m.sets.core}, hard ${m.sets.hard}, clean controls ${m.sets.clean}) as of ${m.asOf}`);
console.log("\nclass".padEnd(46) + "TP   FP   FN   precision  recall    F1");
for (const k of CLASSES) {
  const x = m.classes[k];
  console.log(CLASS_LABEL[k].padEnd(44) + `${String(x.tp).padStart(3)}  ${String(x.fp).padStart(3)}  ${String(x.fn).padStart(3)}   ${pct(x.precision).padStart(8)}  ${pct(x.recall).padStart(7)}  ${pct(x.f1).padStart(6)}`);
}
console.log(`\nAll problem classes: precision ${pct(m.issues.precision)}, recall ${pct(m.issues.recall)}, F1 ${pct(m.issues.f1)}`);
console.log(`Core set: precision ${pct(m.bySet.core.precision)}, recall ${pct(m.bySet.core.recall)} | Hard set: precision ${pct(m.bySet.hard.precision)}, recall ${pct(m.bySet.hard.recall)}`);
console.log(`Clean controls with a false alarm: ${m.cleanControls.withFalseAlarm} of ${m.cleanControls.total}`);
console.log(`R-4 verdict right on ${m.r4.verdictOk} of ${m.r4.verdictOk + m.r4.verdictWrong}; supported claims tied to the right fact ${m.r4.factOk} of ${m.r4.factOk + m.r4.factWrong}`);
if (process.argv.includes("--failures")) {
  console.log("\nWrong cases:");
  for (const r of results) {
    if (!r.missed.length && !r.extra.length) continue;
    console.log(`\n${r.id} [${r.set}] ${JSON.stringify(r.text)}`);
    for (const e of r.missed) console.log(`   MISSED  ${e.cls} ${JSON.stringify(e.quote)} ${e.verdict ?? ""}`);
    for (const p of r.extra) console.log(`   EXTRA   ${p.cls} ${JSON.stringify(p.quote)} ${p.verdict}`);
  }
}
