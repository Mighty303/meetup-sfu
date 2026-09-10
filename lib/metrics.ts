// Everything the admin portal reports. One module so the queries live together
// and the page stays presentation only.
//
// All of this is read-only and runs against the meetup schema plus Postgres's
// own catalogs. Nothing here writes.

import { getDb } from "./db";
import { indexByClassNumber, type CourseWithSections } from "./sfu";

/** Neon's free tier. Override once the project moves to a paid plan. */
const STORAGE_LIMIT_BYTES = Number(process.env.DB_STORAGE_LIMIT_BYTES) || 512 * 1024 * 1024;

/** How long a cached term dump is considered fresh — mirrors lib/sections.ts. */
const CACHE_TTL_HOURS = 24;

const HISTORY_DAYS = 30;

export interface Totals {
  groups: number;
  users: number;
  members: number;
  /** Rows predating sign-in, still editable by anyone with the invite code. */
  ownerlessMembers: number;
  courseRows: number;
  blockRows: number;
  cachedTerms: number;
  customAvatars: number;
  newUsers7d: number;
  /** users.updated_at is bumped on every sign-in, so this is "signed in since". */
  activeUsers7d: number;
  newGroups7d: number;
  membersWithCourses: number;
  usersInGroups: number;
}

export interface TableSize {
  name: string;
  totalBytes: number;
  heapBytes: number;
  indexBytes: number;
  liveRows: number;
}

export interface SchemaSize {
  name: string;
  bytes: number;
  tables: number;
}

export interface Storage {
  databaseBytes: number;
  limitBytes: number;
  /** Sum of the meetup schema's tables, so the app's own share is visible. */
  schemaBytes: number;
  avatarBytes: number;
  largestAvatarBytes: number;
  tables: TableSize[];
  schemas: SchemaSize[];
}

export interface GroupRow {
  id: number;
  code: string;
  name: string;
  term: string;
  createdAt: string;
  members: number;
  signedIn: number;
  scheduled: number;
  courseRows: number;
  /** Newest sign-in among its members — the closest thing to "last used". */
  lastSeen: string | null;
}

export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  image: string | null;
  customAvatar: boolean;
  createdAt: string;
  lastSeen: string;
  groups: number;
  courseRows: number;
}

export interface DayRow {
  day: string;
  groups: number;
  users: number;
}

export interface CacheRow {
  term: string;
  bytes: number;
  courses: number;
  fetchedAt: string;
  fresh: boolean;
}

export interface CourseRow {
  term: string;
  classNumber: string;
  /** "CMPT 225 D100" once resolved from the cache, else just the class number. */
  label: string;
  members: number;
}

export interface AdminMetrics {
  generatedAt: string;
  totals: Totals;
  storage: Storage;
  groups: GroupRow[];
  users: UserRow[];
  daily: DayRow[];
  cache: CacheRow[];
  topCourses: CourseRow[];
}

/** Postgres hands int8 back as a string; every numeric field goes through this. */
function n(value: unknown): number {
  return Number(value ?? 0);
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const sql = getDb();

  // Independent reads, so one round trip's latency instead of eight.
  const [totalsRows, storageRows, tableRows, schemaRows, groupRows, userRows, dailyRows, cacheRows, courseRows] =
    await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*) FROM meetup.groups) AS groups,
          (SELECT COUNT(*) FROM meetup.users) AS users,
          (SELECT COUNT(*) FROM meetup.members) AS members,
          (SELECT COUNT(*) FROM meetup.members WHERE user_id IS NULL) AS ownerless_members,
          (SELECT COUNT(*) FROM meetup.member_courses) AS course_rows,
          (SELECT COUNT(*) FROM meetup.member_blocks) AS block_rows,
          (SELECT COUNT(*) FROM meetup.sections_cache) AS cached_terms,
          (SELECT COUNT(*) FROM meetup.users WHERE avatar IS NOT NULL) AS custom_avatars,
          (SELECT COUNT(*) FROM meetup.users WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_7d,
          (SELECT COUNT(*) FROM meetup.users WHERE updated_at > NOW() - INTERVAL '7 days') AS active_users_7d,
          (SELECT COUNT(*) FROM meetup.groups WHERE created_at > NOW() - INTERVAL '7 days') AS new_groups_7d,
          (SELECT COUNT(DISTINCT member_id) FROM meetup.member_courses) AS members_with_courses,
          (SELECT COUNT(DISTINCT user_id) FROM meetup.members WHERE user_id IS NOT NULL) AS users_in_groups
      `,

      sql`
        SELECT
          pg_database_size(current_database()) AS database_bytes,
          (SELECT COALESCE(SUM(octet_length(avatar)), 0) FROM meetup.users) AS avatar_bytes,
          (SELECT COALESCE(MAX(octet_length(avatar)), 0) FROM meetup.users) AS largest_avatar_bytes
      `,

      // relkind 'r' only: pg_total_relation_size already folds in each table's
      // indexes and TOAST, so counting those separately would double-count.
      sql`
        SELECT c.relname AS name,
               pg_total_relation_size(c.oid) AS total_bytes,
               pg_table_size(c.oid) AS heap_bytes,
               pg_indexes_size(c.oid) AS index_bytes,
               COALESCE(s.n_live_tup, 0) AS live_rows
        FROM pg_class c
        JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE nsp.nspname = 'meetup' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
      `,

      // The tutoring app shares this database, so the portal shows every schema
      // — otherwise "we're near the limit" would have no visible cause.
      sql`
        SELECT nsp.nspname AS name,
               SUM(pg_total_relation_size(c.oid)) AS bytes,
               COUNT(*) AS tables
        FROM pg_class c
        JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'm')
          AND nsp.nspname NOT IN ('pg_catalog', 'information_schema')
          AND nsp.nspname NOT LIKE 'pg_toast%'
        GROUP BY nsp.nspname
        ORDER BY 2 DESC
      `,

      // The users join is at most one row per member, so it can't inflate the
      // course count the member_courses join produces.
      sql`
        SELECT g.id, g.code, g.name, g.term, g.created_at,
               COUNT(DISTINCT m.id) AS members,
               COUNT(DISTINCT m.user_id) AS signed_in,
               COUNT(DISTINCT mc.member_id) AS scheduled,
               COUNT(mc.class_number) AS course_rows,
               MAX(u.updated_at) AS last_seen
        FROM meetup.groups g
        LEFT JOIN meetup.members m ON m.group_id = g.id
        LEFT JOIN meetup.member_courses mc ON mc.member_id = m.id
        LEFT JOIN meetup.users u ON u.id = m.user_id
        GROUP BY g.id
        ORDER BY g.created_at DESC
      `,

      sql`
        SELECT u.id, u.email, u.name,
               COALESCE(u.avatar, u.image) AS image,
               (u.avatar IS NOT NULL) AS custom_avatar,
               u.created_at, u.updated_at,
               COUNT(DISTINCT m.id) AS groups,
               COUNT(mc.class_number) AS course_rows
        FROM meetup.users u
        LEFT JOIN meetup.members m ON m.user_id = u.id
        LEFT JOIN meetup.member_courses mc ON mc.member_id = m.id
        GROUP BY u.id
        ORDER BY u.updated_at DESC
      `,

      // Days with nothing still need a row, or the chart would compress gaps
      // and read as steady growth.
      sql`
        SELECT d::date AS day,
               (SELECT COUNT(*) FROM meetup.groups g WHERE g.created_at::date = d::date) AS groups,
               (SELECT COUNT(*) FROM meetup.users u WHERE u.created_at::date = d::date) AS users
        FROM generate_series(
          (NOW() AT TIME ZONE 'UTC')::date - make_interval(days => ${HISTORY_DAYS - 1}),
          (NOW() AT TIME ZONE 'UTC')::date,
          INTERVAL '1 day'
        ) d
        ORDER BY d
      `,

      // pg_column_size reports the compressed, on-disk size, which is what the
      // storage number is actually made of.
      sql`
        SELECT term,
               pg_column_size(payload) AS bytes,
               CASE WHEN jsonb_typeof(payload) = 'array' THEN jsonb_array_length(payload) ELSE 0 END AS courses,
               fetched_at,
               (fetched_at > NOW() - make_interval(hours => ${CACHE_TTL_HOURS})) AS fresh
        FROM meetup.sections_cache
        ORDER BY fetched_at DESC
      `,

      // class_number is only unique within a term, so the term comes along.
      sql`
        SELECT g.term, mc.class_number, COUNT(*) AS members
        FROM meetup.member_courses mc
        JOIN meetup.members m ON m.id = mc.member_id
        JOIN meetup.groups g ON g.id = m.group_id
        GROUP BY g.term, mc.class_number
        ORDER BY 3 DESC, 2
        LIMIT 12
      `,
    ]);

  const t = totalsRows[0];
  const s = storageRows[0];

  const tables: TableSize[] = tableRows.map((r) => ({
    name: r.name as string,
    totalBytes: n(r.total_bytes),
    heapBytes: n(r.heap_bytes),
    indexBytes: n(r.index_bytes),
    liveRows: n(r.live_rows),
  }));

  return {
    generatedAt: new Date().toISOString(),

    totals: {
      groups: n(t.groups),
      users: n(t.users),
      members: n(t.members),
      ownerlessMembers: n(t.ownerless_members),
      courseRows: n(t.course_rows),
      blockRows: n(t.block_rows),
      cachedTerms: n(t.cached_terms),
      customAvatars: n(t.custom_avatars),
      newUsers7d: n(t.new_users_7d),
      activeUsers7d: n(t.active_users_7d),
      newGroups7d: n(t.new_groups_7d),
      membersWithCourses: n(t.members_with_courses),
      usersInGroups: n(t.users_in_groups),
    },

    storage: {
      databaseBytes: n(s.database_bytes),
      limitBytes: STORAGE_LIMIT_BYTES,
      schemaBytes: tables.reduce((sum, x) => sum + x.totalBytes, 0),
      avatarBytes: n(s.avatar_bytes),
      largestAvatarBytes: n(s.largest_avatar_bytes),
      tables,
      schemas: schemaRows.map((r) => ({
        name: r.name as string,
        bytes: n(r.bytes),
        tables: n(r.tables),
      })),
    },

    groups: groupRows.map((r) => ({
      id: r.id as number,
      code: r.code as string,
      name: r.name as string,
      term: r.term as string,
      createdAt: iso(r.created_at),
      members: n(r.members),
      signedIn: n(r.signed_in),
      scheduled: n(r.scheduled),
      courseRows: n(r.course_rows),
      lastSeen: r.last_seen ? iso(r.last_seen) : null,
    })),

    users: userRows.map((r) => ({
      id: r.id as number,
      email: r.email as string,
      name: (r.name as string | null) ?? null,
      image: (r.image as string | null) ?? null,
      customAvatar: !!r.custom_avatar,
      createdAt: iso(r.created_at),
      lastSeen: iso(r.updated_at),
      groups: n(r.groups),
      courseRows: n(r.course_rows),
    })),

    daily: dailyRows.map((r) => ({
      day: iso(r.day).slice(0, 10),
      groups: n(r.groups),
      users: n(r.users),
    })),

    cache: cacheRows.map((r) => ({
      term: r.term as string,
      bytes: n(r.bytes),
      courses: n(r.courses),
      fetchedAt: iso(r.fetched_at),
      fresh: !!r.fresh,
    })),

    topCourses: await labelCourses(
      courseRows.map((r) => ({
        term: r.term as string,
        classNumber: r.class_number as string,
        members: n(r.members),
      }))
    ),
  };
}

/**
 * Turn class numbers into course names using the cached term dumps only — the
 * portal never triggers an upstream fetch, so opening it can't be what makes a
 * cold term take ten seconds. An unresolved number just prints as itself.
 */
async function labelCourses(
  rows: { term: string; classNumber: string; members: number }[]
): Promise<CourseRow[]> {
  if (rows.length === 0) return [];

  const sql = getDb();
  const terms = [...new Set(rows.map((r) => r.term))];
  const cached = await sql`
    SELECT term, payload FROM meetup.sections_cache WHERE term = ANY(${terms}::text[])
  `;

  const byTerm = new Map<string, ReturnType<typeof indexByClassNumber>>();
  for (const row of cached) {
    byTerm.set(row.term as string, indexByClassNumber(row.payload as CourseWithSections[]));
  }

  return rows.map((r) => {
    const hit = byTerm.get(r.term)?.get(r.classNumber);
    return {
      ...r,
      label: hit
        ? `${hit.course.dept} ${hit.course.number} ${hit.section.section}`
        : r.classNumber,
    };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
