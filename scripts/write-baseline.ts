// Writes lib/eval/baseline.json from the current rules-only run. Only run this on purpose, after reviewing `npm run eval`.
import { writeFileSync } from "node:fs";
import { runRulesEval } from "../lib/eval/run";

const { metrics } = runRulesEval();
writeFileSync(new URL("../lib/eval/baseline.json", import.meta.url), JSON.stringify(metrics, null, 2) + "\n");
console.log("Baseline written:", metrics.cases, "cases");
