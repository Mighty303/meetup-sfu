import { getDb } from "./db";
import { getTermSections } from "./sections";
import { indexByClassNumber, type DayKey } from "./sfu";
import {
  busyFromCourses,
  clampWeekToTerm,
  commonFree,
  termBounds,
  weekDates,
  type TermBounds,
  type BusyBlock,
  type FreeWindow,
} from "./overlap";

export const MEMBER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
];

// Ambiguous characters (0/O, 1/I) left out — these codes get read aloud and retyped.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export interface Group {
  id: number;
  code: string;
  name: string;
  term: string;
}

export interface Member {
  id: number;
  displayName: string;
  color: string;
  classNumbers: string[];
}

export interface GroupState {
  group: Group;
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  /** Class numbers we couldn't resolve — usually saved under a different term. */
  unresolved: Record<number, string[]>;
  /** The Monday actually used, after clamping into the term. */
  week: string;
  termBounds: TermBounds | null;
}

export async function createGroup(name: string, term: string): Promise<Group> {
  const sql = getDb();
  // Collisions are vanishingly rare at 31^7, but a retry is cheaper than a 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const rows = await sql`
      INSERT INTO meetup.groups (code, name, term)
      VALUES (${code}, ${name}, ${term})
      ON CONFLICT (code) DO NOTHING
      RETURNING id, code, name, term
    `;
    if (rows.length > 0) return rows[0] as Group;
  }
  throw new Error("could not allocate a unique group code");
}

export async function findGroup(code: string): Promise<Group | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, code, name, term FROM meetup.groups WHERE code = ${code}
  `;
  return (rows[0] as Group) ?? null;
}

export async function addMember(
  groupId: number,
  displayName: string
): Promise<Member> {
  const sql = getDb();
  const existing = await sql`
    SELECT COUNT(*)::int AS n FROM meetup.members WHERE group_id = ${groupId}
  `;
  const color = MEMBER_COLORS[existing[0].n % MEMBER_COLORS.length];
  const rows = await sql`
    INSERT INTO meetup.members (group_id, display_name, color)
    VALUES (${groupId}, ${displayName}, ${color})
    RETURNING id, display_name, color
  `;
  return {
    id: rows[0].id,
    displayName: rows[0].display_name,
    color: rows[0].color,
    classNumbers: [],
  };
}

export async function setMemberCourses(
  memberId: number,
  classNumbers: string[]
): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM meetup.member_courses WHERE member_id = ${memberId}`;
  if (classNumbers.length === 0) return;
  // One statement, one round trip — neon-http has no transactions for loops.
  await sql`
    INSERT INTO meetup.member_courses (member_id, class_number)
    SELECT ${memberId}, UNNEST(${classNumbers}::text[])
    ON CONFLICT DO NOTHING
  `;
}

export async function removeMember(memberId: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM meetup.members WHERE id = ${memberId}`;
}

export async function memberBelongsToGroup(
  memberId: number,
  groupId: number
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT 1 FROM meetup.members WHERE id = ${memberId} AND group_id = ${groupId}
  `;
  return rows.length > 0;
}

export interface GroupStateOptions {
  week: Date;
  dayStart: number;
  dayEnd: number;
  minMinutes: number;
  days?: readonly DayKey[];
}

export async function getGroupState(
  group: Group,
  opts: GroupStateOptions
): Promise<GroupState> {
  const sql = getDb();
  const rows = await sql`
    SELECT m.id, m.display_name, m.color,
           COALESCE(ARRAY_AGG(mc.class_number) FILTER (WHERE mc.class_number IS NOT NULL), '{}') AS class_numbers
    FROM meetup.members m
    LEFT JOIN meetup.member_courses mc ON mc.member_id = m.id
    WHERE m.group_id = ${group.id}
    GROUP BY m.id, m.display_name, m.color
    ORDER BY m.id
  `;

  const members: Member[] = rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    color: r.color,
    classNumbers: r.class_numbers as string[],
  }));

  const blocks = await sql`
    SELECT mb.member_id, mb.day, mb.start_min, mb.end_min, mb.label
    FROM meetup.member_blocks mb
    JOIN meetup.members m ON m.id = mb.member_id
    WHERE m.group_id = ${group.id}
  `;

  const courses = await getTermSections(group.term);
  const index = indexByClassNumber(courses);
  const bounds = termBounds(courses);
  const week = clampWeekToTerm(opts.week, bounds);
  const dates = weekDates(week);

  const busyByMember: Record<number, BusyBlock[]> = {};
  const unresolved: Record<number, string[]> = {};

  for (const member of members) {
    const courseBlocks = busyFromCourses(index, member.classNumbers, dates);
    const custom: BusyBlock[] = blocks
      .filter((b) => b.member_id === member.id)
      .map((b) => ({
        day: b.day as DayKey,
        start: b.start_min,
        end: b.end_min,
        campus: null, // a custom block doesn't pin them to a campus
        label: b.label,
      }));
    busyByMember[member.id] = [...courseBlocks, ...custom];
    unresolved[member.id] = member.classNumbers.filter((cn) => !index.has(cn));
  }

  // A member with no schedule yet would otherwise read as "free always" and
  // silently widen everyone's overlap, so only count members who've added one.
  const participating = members.filter(
    (m) => busyByMember[m.id].length > 0 || m.classNumbers.length > 0
  );

  const free =
    participating.length === 0
      ? []
      : commonFree({
          membersBusy: participating.map((m) => busyByMember[m.id]),
          dayStart: opts.dayStart,
          dayEnd: opts.dayEnd,
          minMinutes: opts.minMinutes,
          days: opts.days,
        });

  return {
    group,
    members,
    busyByMember,
    free,
    unresolved,
    week: dates.Mo,
    termBounds: bounds,
  };
}
