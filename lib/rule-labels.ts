/** Plain names for the rule IDs, used by the insights and evaluation pages. */
export const RULE_LABEL: Record<string, string> = {
  "R-1": "Terms and tone",
  "R-2": "Absolutes and guarantees",
  "R-3": "Medical or cure wording",
  "R-4": "Claims need an approved fact",
  "R-5": "Required disclaimer",
  "R-6": "Alt text",
  "R-7": "Text contrast and size",
  "R-8": "Brand colours",
};
export const ruleLabel = (id: string) => RULE_LABEL[id] ?? id;
