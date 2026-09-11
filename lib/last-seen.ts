import { after } from "next/server";
import { getDb } from "./db";

/**
 * Recording that a signed-in person is currently on the site.
 *
 * Called from the NextAuth session callback, which is the one place every
 * server-side session resolution passes through: page views, API routes, and
 * the /api/auth/session request the client makes to hydrate useSession().
 * That last one is what gives this full coverage — most of this app's pages are
 * client components, so a per-page call would have missed them, and putting it
 * in the root layout would have meant calling auth() there and turning every
 * static page dynamic for the sake of a timestamp.
 */

/**
 * How stale the stored value has to be before another write is worth it.
 *
 * This is not a micro-optimisation. One load of the home page was measured
 * making four /api/auth/session requests plus one /api/me — five trips through
 * the session callback for a single visit. Unthrottled, that is five UPDATEs to
 * record one person arriving, and nobody reading this column cares which minute
 * inside the last five it was.
 */
export const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Users we've written for recently, so a warm instance can skip the round trip
 * entirely rather than issuing an UPDATE that the WHERE clause will discard.
 *
 * Per-instance and therefore not authoritative — serverless runs many of these
 * and they don't share memory. That's why the interval is enforced in SQL as
 * well: this map is the optimisation, the WHERE clause is the rule.
 *
 * It earns its keep on the burst above: touchLastSeen runs to completion
 * synchronously, so of those five callbacks the first schedules a write and the
 * other four return without touching the database at all.
 */
const recentlyWritten = new Map<number, number>();

/**
 * Bounded so a long-lived instance can't accumulate an entry per user forever.
 * Well above any plausible number of people active within one interval, so in
 * practice the sweep never runs.
 */
const MAX_TRACKED = 5_000;

function shouldWrite(userId: number, now: number): boolean {
  const last = recentlyWritten.get(userId);
  return last === undefined || now - last >= LAST_SEEN_INTERVAL_MS;
}

function remember(userId: number, now: number): void {
  if (recentlyWritten.size >= MAX_TRACKED) {
    for (const [id, at] of recentlyWritten) {
      if (now - at >= LAST_SEEN_INTERVAL_MS) recentlyWritten.delete(id);
    }
    // Still full: every entry is inside the interval, so none can be dropped on
    // age. Start over rather than grow without bound — the cost is a burst of
    // writes the SQL guard will mostly discard anyway.
    if (recentlyWritten.size >= MAX_TRACKED) recentlyWritten.clear();
  }
  recentlyWritten.set(userId, now);
}

/**
 * Stamp this user as seen. Returns immediately: the write is handed to `after`,
 * which runs it once the response has been sent, so nothing here is on the path
 * of a page render.
 */
export function touchLastSeen(userId: number): void {
  const now = Date.now();
  if (!shouldWrite(userId, now)) return;

  try {
    after(async () => {
      try {
        const sql = getDb();
        // The interval is repeated here rather than trusted from the map above:
        // another instance may have written a moment ago, and this is the only
        // check that sees the value they wrote.
        await sql`
          UPDATE meetup.users
          SET last_seen_at = NOW()
          WHERE id = ${userId}
            AND (
              last_seen_at IS NULL
              OR last_seen_at < NOW() - make_interval(secs => ${LAST_SEEN_INTERVAL_MS / 1000})
            )
        `;
      } catch {
        // A telemetry write is not worth surfacing. The response has already
        // gone out by the time this runs, so there is nobody left to tell, and
        // an unhandled rejection here would be noise in the platform logs on
        // every request during a database blip.
      }
    });
  } catch {
    // `after` throws E468 outside a request scope — a build-time prerender, or
    // a script calling auth(). Neither is somebody visiting, so there is
    // nothing to record and nothing to report.
    return;
  }

  // Only after `after` accepted the callback, so a context that can't schedule
  // work doesn't suppress the next five minutes of real visits.
  remember(userId, now);
}
