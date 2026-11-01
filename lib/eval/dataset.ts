/**
 * Labelled evaluation set for ProofLine's text checks.
 *
 * Every case is a short piece of AquaPulse copy with the findings a careful reviewer would expect, written from the
 * brand guidelines (G-1 to G-6) and the approved facts (F-01 to F-14), NOT from what the rule engine outputs.
 * Dates are pinned to EVAL_TODAY so the labels do not drift when facts expire (F-07 and F-14 are expired on that date).
 *
 * Sets:
 *  - core:  typical violations the fixed rules are designed to catch
 *  - hard:  paraphrases and indirect wording a fixed rule cannot see (an AI step may)
 *  - clean: controls with no problems (some contain true, approved claims)
 *
 * Caveat, stated on the Evaluation page too: one person wrote both the rules and this set, so it measures
 * consistency with the guidelines, not performance on unseen real-world copy.
 */
export const EVAL_TODAY = "2026-11-01";

export type EvalRule = "R-1" | "R-2" | "R-3" | "R-4" | "R-5";
export interface Expected {
  r: EvalRule;
  /** The words that should be flagged. Not used for R-5 (a missing disclaimer is a property of the whole text). */
  q?: string;
  /** For R-4 only: what the verdict should be. */
  v?: "supported" | "unsupported" | "outdated";
  /** For supported R-4 claims: the approved fact that backs it. */
  f?: string;
}
export type EvalSet = "core" | "hard" | "clean";
export interface EvalCase {
  id: string;
  set: EvalSet;
  channel: string;
  text: string;
  expect: Expected[];
}

const DISC = "AquaPulse is a sports drink, not a medicine. It is not intended to diagnose, treat, cure or prevent any disease. Individual results vary.";
let n = 0;
const c = (set: EvalSet, channel: string, text: string, expect: Expected[] = []): EvalCase => ({
  id: `E-${String(++n).padStart(3, "0")}`,
  set,
  channel,
  text,
  expect,
});
const t = (r: EvalRule, q: string): Expected => ({ r, q });
const R5: Expected = { r: "R-5" };
const sup = (q: string, f: string): Expected => ({ r: "R-4", q, v: "supported", f });
const uns = (q: string): Expected => ({ r: "R-4", q, v: "unsupported" });
const old = (q: string): Expected => ({ r: "R-4", q, v: "outdated" });

export const DATASET: EvalCase[] = [
  // ---------------------------------------------------------------- R-1 terminology and tone (core)
  c("core", "Instagram", "AquaPulse is the best energy drink for your morning run.", [t("R-1", "energy drink")]),
  c("core", "Instagram", "Looking for a cheap way to stay hydrated? Try AquaPulse.", [t("R-1", "cheap")]),
  c("core", "Instagram", "These new flavours are insane, you have to try them.", [t("R-1", "insane")]),
  c("core", "Website", "Aqua Pulse is back on the shelves this month.", [t("R-1", "Aqua Pulse")]),
  c("core", "Instagram", "NEW FLAVOURS are here and they taste GREAT.", [t("R-1", "FLAVOURS"), t("R-1", "GREAT")]),
  c("core", "Email", "Energy drinks are not what we make, and we want you to know why.", [t("R-1", "Energy drinks")]),
  c("core", "Instagram", "An energy-drink alternative with no added caffeine.", [t("R-1", "energy-drink")]),
  c("core", "Instagram", "Cheap and cheerful, insane value, every single day.", [t("R-1", "Cheap"), t("R-1", "insane")]),
  c("core", "Website", "Our energy drink range now has three flavours.", [t("R-1", "energy drink")]),
  c("core", "Instagram", "Why pay more? AquaPulse is cheap and it is a sports drink.", [t("R-1", "cheap")]),
  c("core", "Email", "We are INCREDIBLY proud of this season's team.", [t("R-1", "INCREDIBLY")]),
  c("core", "Instagram", "Aqua Pulse and friends: a cheap day out.", [t("R-1", "Aqua Pulse"), t("R-1", "cheap")]),

  // ---------------------------------------------------------------- R-2 absolutes and guarantees (core)
  c("core", "Instagram", "Guaranteed to refresh you on the hottest day.", [t("R-2", "Guaranteed")]),
  c("core", "Instagram", "We guarantee you will love the berry flavour.", [t("R-2", "guarantee")]),
  c("core", "Website", "Feel the difference in 7 days.", [t("R-2", "in 7 days")]),
  c("core", "Instagram", "Get instant hydration after every run.", [t("R-2", "instant")]),
  c("core", "Instagram", "Always cold, always fresh, always AquaPulse.", [t("R-2", "Always")]),
  c("core", "Email", "Try it with our risk-free trial pack.", [t("R-2", "risk-free")]),
  c("core", "Website", "100% satisfaction on every bottle.", [t("R-2", "100%")]),
  c("core", "Instagram", "Wake up refreshed overnight with AquaPulse.", [t("R-2", "overnight")]),
  c("core", "Website", "Zero side effects and a great taste.", [t("R-2", "zero side effects")]),
  c("core", "Email", "Noticeable change within 3 weeks of daily use.", [t("R-2", "within 3 weeks")]),
  c("core", "Instagram", "It never fails to refresh you.", [t("R-2", "never fails")]),
  c("core", "Press note", "A guaranteed hit this summer.", [t("R-2", "guaranteed")]),

  // ---------------------------------------------------------------- R-3 medical or cure wording (core)
  c("core", "Instagram", "AquaPulse cures fatigue after a long day.", [t("R-3", "cures fatigue"), R5]),
  c("core", "Instagram", "Heals sore muscles after the gym.", [t("R-3", "Heals sore")]),
  c("core", "Website", "AquaPulse treats dehydration quickly.", [t("R-3", "treats dehydration")]),
  c("core", "Instagram", "Prevents cramps on long runs.", [t("R-3", "Prevents cramps")]),
  c("core", "Instagram", "Boosts your immunity, season after season.", [t("R-3", "Boosts your immunity"), R5]),
  c("core", "Email", "Lose 5 kg in a month with our drink.", [t("R-3", "Lose 5 kg")]),
  c("core", "Instagram", "A daily detox for your body.", [t("R-3", "detox")]),
  c("core", "Instagram", "A miracle in a bottle.", [t("R-3", "miracle")]),
  c("core", "Website", "AquaPulse relieves headaches caused by the heat.", [t("R-3", "relieves headaches")]),
  c("core", "Press note", "Our drink cured my tiredness, says one runner.", [t("R-3", "cured my")]),
  c("core", "Instagram", "Heal faster between training sessions.", [t("R-3", "Heal faster")]),
  c("core", "Email", "Burn 2 kg a week while you sip AquaPulse.", [t("R-3", "Burn 2 kg")]),

  // ---------------------------------------------------------------- R-4 claims that need an approved fact (core)
  c("core", "Instagram", "AquaPulse is the #1 sports drink in India.", [old("#1")]),
  c("core", "Website", "Sold in more than 2,000 stores across 14 Indian states.", [sup("more than 2,000 stores", "F-04")]),
  c("core", "Website", "Sold in more than 3,000 stores across India.", [uns("more than 3,000 stores")]),
  c("core", "Instagram", "Our bottles are made with 40% recycled PET.", [sup("40%", "F-05")]),
  c("core", "Instagram", "Our bottles are made with 60% recycled PET.", [uns("60%")]),
  c("core", "Press note", "We sponsor 12 athletes this season.", [sup("12 athletes", "F-06")]),
  c("core", "Press note", "We now sponsor 30 athletes across the country.", [uns("30 athletes")]),
  c("core", "Press note", "Over 50,000 bottles sold every week.", [old("Over 50,000 bottles")]),
  c("core", "Email", "7 in 10 consumers preferred AquaPulse lemon-lime over a leading rival.", [sup("7 in 10", "F-08")]),
  c("core", "Instagram", "Rated number one by athletes.", [uns("number one")]),
  c("core", "Website", "Clinically proven to hydrate better.", [uns("Clinically proven")]),
  c("core", "Instagram", "An award-winning flavour you will love.", [uns("award-winning")]),
  c("core", "Website", "The doctor recommended sports drink.", [uns("doctor recommended")]),
  c("core", "Instagram", "Better than any rival on the market.", [uns("Better than")]),
  c("core", "Email", "Tastier than the leading brand, say fans.", [uns("Tastier than")]),
  c("core", "Press note", "AquaPulse outperforms other sports drinks.", [uns("outperforms")]),
  c("core", "Press note", "India's best-selling sports drink, again.", [old("best-selling")]),
  c("core", "Website", "Our leading brand status is hard earned.", [old("leading brand")]),
  c("core", "Instagram", "Top-rated by 9 out of 10 athletes.", [uns("Top-rated"), uns("9 out of 10")]),
  c("core", "Press note", "Used by over 1 million customers.", [uns("over 1 million")]),
  c("core", "Instagram", "Up to 25% off this week only.", [uns("Up to 25%")]),
  c("core", "Instagram", "Cheaper than every rival.", [uns("Cheaper than")]),
  c("core", "Email", "Join the 15 athletes we sponsor.", [uns("15 athletes")]),
  c("core", "Website", "Join more than 500 reviews from happy runners.", [uns("more than 500 reviews")]),

  // ---------------------------------------------------------------- R-5 required disclaimer (core)
  c("core", "Instagram", "Great for your recovery after workouts.", [R5]),
  c("core", "Website", "Supports your performance on game day.", [R5]),
  c("core", "Instagram", "Boost your game with a cold bottle.", [R5]),
  c("core", "Email", "Look after your health, one bottle at a time.", [R5]),
  c("core", "Instagram", "See results on the track this season.", [R5]),
  c("core", "Website", "Beat fatigue by planning your day well.", [R5]),
  c("core", "Instagram", "Better recovery starts with good habits.", [R5]),
  c("core", "Instagram", "Peak performance needs sleep and hydration.", [R5]),

  // ---------------------------------------------------------------- combinations, as a creator would really write them (core)
  c("core", "Instagram", "AquaPulse cures fatigue! The #1 sports drink in India, with 100% natural ingredients. Guaranteed results in 7 days. INSANE hydration for your workout.", [t("R-3", "cures fatigue"), old("#1"), t("R-2", "100%"), t("R-2", "Guaranteed"), t("R-2", "in 7 days"), t("R-1", "INSANE"), R5]),
  c("core", "Press note", "AquaPulse now sells over 50,000 bottles every week, and our bottles are made with 40% recycled PET. Join the athletes who trust AquaPulse for recovery. Aqua Pulse is the cheap way to stay hydrated.", [old("over 50,000 bottles"), sup("40%", "F-05"), t("R-1", "Aqua Pulse"), t("R-1", "cheap"), R5]),
  c("core", "Instagram", "The #1 energy drink, guaranteed.", [old("#1"), t("R-1", "energy drink"), t("R-2", "guaranteed")]),
  c("core", "Email", "Cheap, instant and guaranteed relief from tiredness.", [t("R-1", "Cheap"), t("R-2", "instant"), t("R-2", "guaranteed")]),
  c("core", "Instagram", "Heals and detoxes. Clinically proven.", [t("R-3", "Heals and"), t("R-3", "detoxes"), uns("Clinically proven")]),
  c("core", "Website", "India's best-selling sports drink, sold in more than 3,000 stores.", [old("best-selling"), uns("more than 3,000 stores")]),
  c("core", "Press note", "Our 12 athletes say AquaPulse is better than rival brands.", [sup("12 athletes", "F-06"), uns("better than")]),
  c("core", "Instagram", "100% natural and risk-free.", [t("R-2", "100%"), t("R-2", "risk-free")]),
  c("core", "Email", "Boost your immunity and burn 3 kg in a month.", [t("R-3", "Boost your immunity"), t("R-3", "burn 3 kg"), R5]),
  c("core", "Instagram", "NEVER settle. Always choose the #1 drink.", [t("R-2", "Always"), old("#1"), t("R-1", "NEVER")]),
  c("core", "Website", "Aqua Pulse: made with 60% recycled PET.", [t("R-1", "Aqua Pulse"), uns("60%")]),
  c("core", "Press note", "Free from side effects: zero side effects, ever.", [t("R-2", "side effects")]),
  c("core", "Instagram", "Cures cramps, boosts immunity, guaranteed.", [t("R-3", "Cures cramps"), t("R-3", "boosts immunity"), t("R-2", "guaranteed"), R5]),
  c("core", "Email", "Try our cheap, award-winning sports drink.", [t("R-1", "cheap"), uns("award-winning")]),

  // ---------------------------------------------------------------- hard: wording a fixed rule cannot see (an AI step may)
  c("hard", "Instagram", "AquaPulse keeps colds away all winter.", [t("R-3", "keeps colds away")]),
  c("hard", "Instagram", "Say goodbye to tiredness for good.", [t("R-3", "goodbye to tiredness"), t("R-2", "for good")]),
  c("hard", "Website", "The nation's favourite sports drink.", [uns("nation's favourite")]),
  c("hard", "Instagram", "Nothing beats AquaPulse after a run.", [uns("Nothing beats")]),
  c("hard", "Instagram", "Number 1 choice of athletes.", [uns("Number 1")]),
  c("hard", "Email", "Ten out of ten athletes agree.", [uns("Ten out of ten")]),
  c("hard", "Website", "Scientifically formulated by experts.", [uns("Scientifically formulated")]),
  c("hard", "Instagram", "You will feel the difference by tomorrow.", [t("R-2", "by tomorrow")]),
  c("hard", "Instagram", "Cleanse your system with every sip.", [t("R-3", "Cleanse your system")]),
  c("hard", "Website", "Supports a stronger immune system.", [t("R-3", "stronger immune system")]),
  c("hard", "Press note", "Now available in 20 states.", [uns("20 states")]),
  c("hard", "Website", "Free delivery on orders above Rs 299.", [uns("Free delivery on orders above Rs 299")]),
  c("hard", "Website", "AquaPulse launched in 2019.", [uns("launched in 2019")]),
  c("hard", "Instagram", "Fights off infections naturally.", [t("R-3", "Fights off infections")]),
  c("hard", "Website", "Each bottle has 120 calories.", [uns("120 calories")]),
  c("hard", "Press note", "AquaPulse is the preferred choice of professional athletes.", [uns("preferred choice")]),

  // ---------------------------------------------------------------- clean controls: nothing should be flagged
  c("clean", "Instagram", "Thank you for being part of the AquaPulse community this season."),
  c("clean", "Instagram", "Join us this Saturday at the park for a fun run. Bring a friend!"),
  c("clean", "Instagram", "New week, fresh start. What is your next goal?"),
  c("clean", "Instagram", "Stay hydrated and enjoy the weekend with AquaPulse."),
  c("clean", "Email", "Our team is excited to share what is coming next."),
  c("clean", "Instagram", "Tag a friend who runs with you."),
  c("clean", "Instagram", "Happy Diwali from all of us at AquaPulse."),
  c("clean", "Instagram", "Tell us your favourite flavour in the comments."),
  c("clean", "Instagram", "Cheers to every runner who showed up today."),
  c("clean", "Instagram", "Weekend plans: a long walk, good company and a cold bottle of AquaPulse."),
  c("clean", "Email", "Questions about your order? Write to us any time and we will reply."),
  c("clean", "Press note", "Congratulations to the winners of last week's photo contest."),
  c("clean", "Website", "Read the label and serve chilled."),
  c("clean", "Press note", "A big thank you to the volunteers who handed out water at the finish line."),
  c("clean", "Email", "Check back on Monday for the next training tip."),
  c("clean", "Website", "Each 500 ml bottle has 90 calories and no added caffeine.", [sup("90 calories", "F-01")]),
  c("clean", "Website", "AquaPulse is sold in more than 2,000 stores across 14 Indian states.", [sup("more than 2,000 stores", "F-04")]),
  c("clean", "Instagram", "Our bottles are made with 40% recycled PET.", [sup("40%", "F-05")]),
  c("clean", "Press note", "We sponsor 12 national-level athletes in the 2026 season.", [sup("12 national-level athletes", "F-06")]),
  c("clean", "Website", "AquaPulse replaces electrolytes lost through sweat with sodium, potassium and magnesium.", [sup("replaces electrolytes", "F-12")]),
  c("clean", "Website", "AquaPulse is made in FSSAI-licensed facilities.", [sup("FSSAI-licensed", "F-13")]),
  c("clean", "Website", "AquaPulse launched in 2022.", [sup("launched in 2022", "F-09")]),
  c("clean", "Website", "Free delivery on orders above Rs 499 on the AquaPulse website.", [sup("Free delivery on orders above Rs 499", "F-10")]),
  c("clean", "Website", "Recommended serving: one 500 ml bottle during or after exercise.", [sup("one 500 ml bottle", "F-11")]),
  c("clean", "Email", "In a 2025 internal test of 300 consumers, 7 in 10 preferred AquaPulse lemon-lime over a leading rival.", [sup("7 in 10", "F-08")]),
  c("clean", "Website", "AquaPulse comes in lemon-lime, orange and berry flavours.", [sup("lemon-lime, orange and berry", "F-03")]),
  c("clean", "Website", "AquaPulse is sweetened with sugar and stevia and has no artificial colours.", [sup("sugar and stevia", "F-02")]),
  c("clean", "Instagram", `Great for your recovery after a workout. ${DISC}`),
  c("clean", "Website", `Fuel your performance. ${DISC}`),
  c("clean", "Instagram", "Training tip: sip water before, during and after your run, and pair it with a balanced meal."),
  c("clean", "Press note", "AquaPulse is a sports drink for people who like to move."),
];
