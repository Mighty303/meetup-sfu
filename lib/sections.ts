// Term dumps are ~1900 courses. Cache one copy in Postgres so every member of
// every group shares a single upstream fetch, and cold starts stay cheap.

import { getDb } from "./db";
import { fetchTermSections, type CourseWithSections } from "./sfu";

const TTL_HOURS = 24;

export async function getTermSections(
  term: string
): Promise<CourseWithSections[]> {
  const sql = getDb();

  const cached = await sql`
    SELECT payload
    FROM meetup.sections_cache
    WHERE term = ${term}
      AND fetched_at > NOW() - make_interval(hours => ${TTL_HOURS})
  `;
  if (cached.length > 0) {
    return cached[0].payload as CourseWithSections[];
  }

  const fresh = await fetchTermSections(term);
  await sql`
    INSERT INTO meetup.sections_cache (term, payload, fetched_at)
    VALUES (${term}, ${JSON.stringify(fresh)}::jsonb, NOW())
    ON CONFLICT (term) DO UPDATE
      SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
  `;
  return fresh;
}
