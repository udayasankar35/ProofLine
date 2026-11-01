import type { Finding } from "../types";

/** Placeholder until the evaluation suite is wired in. */
export async function measuredFor(): Promise<(f: Finding) => string | undefined> {
  return () => undefined;
}
