import type { Disclaimer, Fact, Guideline, Term, User } from "./types";

// Everything here is FICTIONAL demo data for the made-up brand "AquaPulse".
export const BRAND = "AquaPulse";

export const USERS: User[] = [
  { id: "u-creator", name: "Devon Rao", role: "creator", title: "Social media executive" },
  { id: "u-reviewer", name: "Elena Shah", role: "reviewer", title: "Brand manager" },
  { id: "u-admin", name: "Asha Verma", role: "admin", title: "Brand and compliance owner" },
];

export const GUIDELINES: Guideline[] = [
  {
    id: "G-1",
    title: "Voice, tone and terminology",
    text: "Warm, plain and confident. No hype words, no all-caps shouting, and use the approved product terms. AquaPulse is a sports drink, not an energy drink.",
  },
  {
    id: "G-2",
    title: "Claims need evidence",
    text: "Every factual claim (numbers, proof, endorsements) must match an approved fact that is still in date.",
  },
  {
    id: "G-3",
    title: "No absolutes or guarantees",
    text: "Do not promise outcomes. Avoid words like guaranteed, instant, always, risk-free, and fixed time limits for results.",
  },
  {
    id: "G-4",
    title: "No medical or cure claims",
    text: "AquaPulse is a sports drink, not a medicine. Never say it cures, treats, heals or prevents any condition, including fatigue.",
  },
  {
    id: "G-5",
    title: "Required disclaimers",
    text: "Any health or performance wording must carry the standard disclaimer.",
  },
  {
    id: "G-6",
    title: "Rankings and comparisons",
    text: "Rankings, awards and comparisons with other brands need a current, sourced approved fact.",
  },
];

export const FACTS: Fact[] = [
  { id: "F-01", statement: "Each 500 ml bottle has 90 calories and no added caffeine.", source: "Product label, spec v3", owner: "Product team", expires_on: "2027-12-31", keywords: "calories,kcal,caffeine,500 ml" },
  { id: "F-02", statement: "AquaPulse is sweetened with sugar and stevia and has no artificial colours.", source: "Product label, spec v3", owner: "Product team", expires_on: "2027-12-31", keywords: "sugar,stevia,colour,color,artificial,sweetener" },
  { id: "F-03", statement: "AquaPulse comes in lemon-lime, orange and berry flavours.", source: "Product catalogue 2026", owner: "Marketing", expires_on: "2027-06-30", keywords: "flavour,flavor,lemon,orange,berry" },
  { id: "F-04", statement: "AquaPulse is sold in more than 2,000 stores across 14 Indian states (March 2026).", source: "Sales ops report, March 2026", owner: "Sales operations", expires_on: "2027-03-31", keywords: "stores,states,retail,across india,2,000" },
  { id: "F-05", statement: "AquaPulse bottles are made with 40% recycled PET.", source: "Packaging certificate PKG-2026-114", owner: "Supply chain", expires_on: "2027-06-30", keywords: "recycled,pet,packaging,sustainab" },
  { id: "F-06", statement: "AquaPulse sponsors 12 national-level athletes in the 2026 season.", source: "Sponsorship contracts 2026", owner: "Partnerships", expires_on: "2026-12-31", keywords: "athletes,sponsor,national" },
  { id: "F-07", statement: "AquaPulse ranked #1 in the Indian sports-drink category by volume in FY2024-25.", source: "RetailScope panel, FY2024-25", owner: "Insights", expires_on: "2026-03-31", keywords: "#1,number one,no. 1,rank,best-selling,leading,top-rated,category" },
  { id: "F-08", statement: "In a 2025 internal test of 300 consumers, 7 in 10 preferred AquaPulse lemon-lime over a leading rival.", source: "Internal consumer test CT-2025-08", owner: "Insights", expires_on: "2027-02-28", keywords: "preferred,taste,rival,consumers,7 in 10" },
  { id: "F-09", statement: "AquaPulse launched in 2022.", source: "Company records", owner: "Corporate", expires_on: "2030-12-31", keywords: "launched,since 2022,founded,established" },
  { id: "F-10", statement: "Free delivery on orders above Rs 499 on the AquaPulse website.", source: "Website offer terms", owner: "E-commerce", expires_on: "2026-12-31", keywords: "delivery,shipping,free,499" },
  { id: "F-11", statement: "Recommended serving: one 500 ml bottle during or after exercise.", source: "Product label, spec v3", owner: "Product team", expires_on: "2027-12-31", keywords: "serving,during exercise,after exercise,workout" },
  { id: "F-12", statement: "AquaPulse replaces electrolytes lost through sweat with sodium, potassium and magnesium.", source: "Product label, spec v3", owner: "Product team", expires_on: "2027-12-31", keywords: "electrolyte,sodium,potassium,magnesium,sweat,hydrat" },
  { id: "F-13", statement: "AquaPulse is made in FSSAI-licensed facilities.", source: "FSSAI licence copy", owner: "Quality", expires_on: "2027-09-30", keywords: "fssai,licensed,licence,facility" },
  { id: "F-14", statement: "AquaPulse sold over 50,000 bottles per week in Q1 2026.", source: "Sales ops report, Q1 2026", owner: "Sales operations", expires_on: "2026-09-30", keywords: "bottles,per week,sold,sales,50,000" },
];

export const TERMS: Term[] = [
  { id: "T-01", term: "energy drink", kind: "banned", replacement: "sports drink", reason: "AquaPulse is positioned as a sports drink and contains no caffeine.", guideline_ref: "G-1" },
  { id: "T-02", term: "cheap", kind: "banned", replacement: "affordable", reason: "\"Cheap\" undersells the product. Use \"affordable\".", guideline_ref: "G-1" },
  { id: "T-03", term: "insane", kind: "banned", replacement: "impressive", reason: "Hype wording is off-brand. Keep the tone warm, plain and confident.", guideline_ref: "G-1" },
  { id: "T-04", term: "Aqua Pulse", kind: "banned", replacement: "AquaPulse", reason: "The brand name is written as one word: AquaPulse.", guideline_ref: "G-1" },
];

export const DISCLAIMERS: Disclaimer[] = [
  {
    id: "D-1",
    triggers: "results,health,fatigue,recovery,performance,boost,immunity",
    text: "AquaPulse is a sports drink, not a medicine. It is not intended to diagnose, treat, cure or prevent any disease. Individual results vary.",
  },
];

export interface Sample {
  id: string;
  label: string;
  title: string;
  channel: string;
  body: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "risky",
    label: "Instagram caption (risky)",
    title: "Launch week caption",
    channel: "Instagram",
    body: "AquaPulse cures fatigue! The #1 sports drink in India, with 100% natural ingredients. Guaranteed results in 7 days. INSANE hydration for your workout.",
  },
  {
    id: "clean",
    label: "Website blurb (mostly fine)",
    title: "Product page blurb",
    channel: "Website",
    body: "AquaPulse replaces electrolytes lost through sweat with sodium, potassium and magnesium. Each 500 ml bottle has 90 calories and no added caffeine. Sold in more than 2,000 stores across 14 Indian states.",
  },
  {
    id: "outdated",
    label: "Press note (outdated figure)",
    title: "Quarterly press note",
    channel: "Press note",
    body: "AquaPulse now sells over 50,000 bottles every week, and our bottles are made with 40% recycled PET. Join the athletes who trust AquaPulse for recovery. Aqua Pulse is the cheap way to stay hydrated.",
  },
];
