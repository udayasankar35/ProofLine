/** The daily background check is called by Vercel Cron. If CRON_SECRET is set, only a request carrying it is accepted. */
export function cronAllowed(secret: string | undefined, authorization: string | null): boolean {
  if (!secret) return true; // the sweep only re-checks statuses from existing data; running it is harmless
  return authorization === `Bearer ${secret}`;
}

const g = globalThis as unknown as { __plLastSweep?: number };
/** At most one sweep a minute per server instance, so repeated calls cannot hammer the database. */
export function sweepDue(now = Date.now(), minGapMs = 60_000): boolean {
  if (g.__plLastSweep && now - g.__plLastSweep < minGapMs) return false;
  g.__plLastSweep = now;
  return true;
}
