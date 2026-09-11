// Term dumps are ~1900 courses. Cache one copy in Postgres so every member of
// every group shares a single upstream fetch, and cold starts stay cheap.
//
// The cached payload is ~1.7 MB of JSON, so nothing here ever selects the whole
// row. Every read filters inside Postgres and returns the handful of courses
// the caller asked for — pulling the dump out to filter it in JS costs 1.7 MB
// of egress per request, which is what put this project over Neon's transfer
// allowance once.

import { getDb } from "./db";
import type { TermBounds } from "./overlap";
import {
  coursesByClassNumbers,
  fetchTermSections,
  indexByClassNumber,
  searchCourses,
  type CourseHit,
  type CourseWithSections,
  type SectionDetail,
} from "./sfu";

const TTL_HOURS = 24;

/** Candidate rows pulled for ranking. The picker only ever shows 20. */
const SEARCH_SCAN_LIMIT = 200;

/** `%` and `_` are wildcards in LIKE; a title search must not smuggle them in. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Make sure the term is cached and fresh, fetching upstream if it isn't.
 * Checks `fetched_at` alone — reading the payload just to decide whether to
 * keep it would defeat the point.
 */
async function ensureFreshTerm(term: string): Promise<void> {
  const sql = getDb();

  const fresh = await sql`
    SELECT 1
    FROM meetup.sections_cache
    WHERE term = ${term}
      AND fetched_at > NOW() - make_interval(hours => ${TTL_HOURS})
  `;
  if (fresh.length > 0) return;

  const dump = await fetchTermSections(term);
  await sql`
    INSERT INTO meetup.sections_cache (term, payload, fetched_at)
    VALUES (${term}, ${JSON.stringify(dump)}::jsonb, NOW())
    ON CONFLICT (term) DO UPDATE
      SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
  `;
}

/**
 * Course search. Postgres narrows the dump to candidates by course code or
 * title words; searchCourses then ranks and slims them exactly as it did when
 * it was handed the whole term.
 */
export async function searchTermCourses(
  term: string,
  query: string,
  limit = 20
): Promise<CourseHit[]> {
  const normalized = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.length < 2) return [];

  await ensureFreshTerm(term);
  const sql = getDb();

  // Code matches are a substring test on "cmpt225"; title matches need every
  // typed word present, which is the fallback searchCourses scores last.
  const codePattern = `%${normalized}%`;
  const titlePatterns = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `%${likeLiteral(word)}%`);

  const rows = await sql`
    SELECT c.value AS course
    FROM meetup.sections_cache sc,
         LATERAL jsonb_array_elements(sc.payload) c
    WHERE sc.term = ${term}
      AND (
        regexp_replace(lower((c->>'dept') || (c->>'number')), '[^a-z0-9]', '', 'g')
          LIKE ${codePattern}
        OR lower(c->>'title') LIKE ALL(${titlePatterns}::text[])
      )
    LIMIT ${SEARCH_SCAN_LIMIT}
  `;

  const candidates = rows.map((r) => r.course as CourseWithSections);
  return searchCourses(candidates, query, limit);
}

/**
 * The courses behind a set of saved class numbers, for the picker's chips.
 * Filtered in Postgres, so a member with five sections moves a few kB.
 */
export async function coursesForClassNumbers(
  term: string,
  classNumbers: string[]
): Promise<CourseHit[]> {
  const courses = await coursesContainingClassNumbers(term, classNumbers);
  return coursesByClassNumbers(courses, classNumbers);
}

/**
 * The same narrowed set, indexed by class number — what the calendar export
 * needs to turn saved numbers into meeting times.
 */
export async function sectionIndexForClassNumbers(
  term: string,
  classNumbers: string[]
): Promise<Map<string, { course: CourseWithSections; section: SectionDetail }>> {
  const courses = await coursesContainingClassNumbers(term, classNumbers);
  return indexByClassNumber(courses);
}

/**
 * When the term runs, aggregated in Postgres. The grid needs three dates out of
 * ~1900 courses; computing them here rather than in JS keeps the dump in place.
 *
 * `typicalStart` is the date most sections begin — the week the grid falls back
 * to when the requested one is outside the term. Ties break on the earlier date
 * (the JS version broke them on whichever it happened to see first).
 */
export async function termBoundsFor(term: string): Promise<TermBounds | null> {
  await ensureFreshTerm(term);
  const sql = getDb();

  const rows = await sql`
    WITH sched AS (
      SELECT h->>'startDate' AS start_date,
             h->>'endDate' AS end_date
      FROM meetup.sections_cache sc,
           LATERAL jsonb_array_elements(sc.payload) c,
           LATERAL jsonb_array_elements(c->'sections') s,
           LATERAL jsonb_array_elements(s->'schedules') h
      WHERE sc.term = ${term}
        AND btrim(COALESCE(h->>'days', '')) <> ''
        AND COALESCE(h->>'startDate', '') <> ''
        AND COALESCE(h->>'endDate', '') <> ''
    )
    SELECT MIN(start_date) AS start,
           MAX(end_date) AS "end",
           (
             SELECT start_date
             FROM sched
             GROUP BY start_date
             ORDER BY COUNT(*) DESC, start_date
             LIMIT 1
           ) AS typical_start
    FROM sched
  `;

  const row = rows[0];
  if (!row?.start || !row?.end) return null;
  return {
    start: row.start as string,
    end: row.end as string,
    typicalStart: (row.typical_start as string) ?? (row.start as string),
  };
}

/** Courses carrying at least one of `classNumbers`, sections and all. */
async function coursesContainingClassNumbers(
  term: string,
  classNumbers: string[]
): Promise<CourseWithSections[]> {
  if (classNumbers.length === 0) return [];

  await ensureFreshTerm(term);
  const sql = getDb();

  const rows = await sql`
    SELECT c.value AS course
    FROM meetup.sections_cache sc,
         LATERAL jsonb_array_elements(sc.payload) c
    WHERE sc.term = ${term}
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(c->'sections') s
        WHERE s->>'classNumber' = ANY(${classNumbers}::text[])
      )
  `;

  return rows.map((r) => r.course as CourseWithSections);
}
