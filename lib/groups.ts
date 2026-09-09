import { getDb } from "./db";
import { getTermSections } from "./sections";
import { indexByClassNumber, type DayKey } from "./sfu";
import {
  busyFromCourses,
  clampWeekToTerm,
  commonFree,
  termBounds,
  unscheduledFromCourses,
  weekDates,
  type TermBounds,
  type BusyBlock,
  type FreeWindow,
  type UnscheduledSection,
} from "./overlap";

export const MEMBER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
];

/** Guards the column: the grid puts white text on these, so it's palette-only. */
export function isMemberColor(value: unknown): value is string {
  return typeof value === "string" && (MEMBER_COLORS as readonly string[]).includes(value);
}

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
  /** Null for members created before sign-in existed. */
  userId: number | null;
  image: string | null;
}

export interface GroupState {
  group: Group;
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  /** Class numbers we couldn't resolve — usually saved under a different term. */
  unresolved: Record<number, string[]>;
  /** Enrolled sections with no timetable slot, so nothing to draw on the grid. */
  unscheduled: Record<number, UnscheduledSection[]>;
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
  displayName: string,
  userId: number
): Promise<Member> {
  const sql = getDb();
  const existing = await sql`
    SELECT COUNT(*)::int AS n FROM meetup.members WHERE group_id = ${groupId}
  `;
  const color = MEMBER_COLORS[existing[0].n % MEMBER_COLORS.length];
  const rows = await sql`
    INSERT INTO meetup.members (group_id, display_name, color, user_id)
    VALUES (${groupId}, ${displayName}, ${color}, ${userId})
    RETURNING id, display_name, color, user_id
  `;
  const user = await sql`SELECT image FROM meetup.users WHERE id = ${userId}`;
  return {
    id: rows[0].id,
    displayName: rows[0].display_name,
    color: rows[0].color,
    classNumbers: [],
    userId: rows[0].user_id,
    image: user[0]?.image ?? null,
  };
}

export async function findMemberForUser(
  groupId: number,
  userId: number
): Promise<number | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id FROM meetup.members WHERE group_id = ${groupId} AND user_id = ${userId}
  `;
  return rows[0]?.id ?? null;
}

/**
 * Attach a signed-in user to a member row that predates sign-in, so the people
 * already in a group keep their saved schedule instead of starting over.
 * Only ownerless rows can be claimed, and only if the user has no row here yet.
 */
export async function claimMember(
  memberId: number,
  groupId: number,
  userId: number
): Promise<"ok" | "not-claimable" | "already-member"> {
  const sql = getDb();

  const existing = await findMemberForUser(groupId, userId);
  if (existing !== null) return "already-member";

  const rows = await sql`
    UPDATE meetup.members
    SET user_id = ${userId}
    WHERE id = ${memberId} AND group_id = ${groupId} AND user_id IS NULL
    RETURNING id
  `;
  return rows.length > 0 ? "ok" : "not-claimable";
}

export async function renameMember(
  memberId: number,
  displayName: string
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE meetup.members SET display_name = ${displayName} WHERE id = ${memberId}
  `;
}

/** Colour is per group, so the same person can dodge a clash in each one. */
export async function setMemberColor(memberId: number, color: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE meetup.members SET color = ${color} WHERE id = ${memberId}
  `;
}

/**
 * A member row owned by a signed-in user may only be edited by that user.
 * Rows predating sign-in have no owner and stay editable by anyone holding the
 * invite code, which is how they were created in the first place.
 */
export async function canEditMember(
  memberId: number,
  groupId: number,
  appUserId: number | null
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT user_id FROM meetup.members WHERE id = ${memberId} AND group_id = ${groupId}
  `;
  if (rows.length === 0) return false;
  const owner = rows[0].user_id as number | null;
  return owner === null || owner === appUserId;
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
    SELECT m.id, m.display_name, m.color, m.user_id,
           COALESCE(u.avatar, u.image) AS image,
           COALESCE(ARRAY_AGG(mc.class_number) FILTER (WHERE mc.class_number IS NOT NULL), '{}') AS class_numbers
    FROM meetup.members m
    LEFT JOIN meetup.member_courses mc ON mc.member_id = m.id
    LEFT JOIN meetup.users u ON u.id = m.user_id
    WHERE m.group_id = ${group.id}
    GROUP BY m.id, m.display_name, m.color, m.user_id, u.avatar, u.image
    ORDER BY m.id
  `;

  const members: Member[] = rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    color: r.color,
    classNumbers: r.class_numbers as string[],
    userId: r.user_id ?? null,
    image: r.image ?? null,
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
  const unscheduled: Record<number, UnscheduledSection[]> = {};

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
        course: b.label,
        detail: "",
      }));
    busyByMember[member.id] = [...courseBlocks, ...custom];
    unresolved[member.id] = member.classNumbers.filter((cn) => !index.has(cn));
    unscheduled[member.id] = unscheduledFromCourses(index, member.classNumbers);
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
          members: participating.map((m) => ({
            name: m.displayName,
            busy: busyByMember[m.id],
          })),
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
    unscheduled,
    week: dates.Mo,
    termBounds: bounds,
  };
}

export interface Membership {
  memberId: number;
  displayName: string;
  color: string;
  classNumbers: string[];
  group: Group;
  /** Everyone in that group, you included — enough to recognise it at a glance. */
  members: {
    id: number;
    displayName: string;
    color: string;
    image: string | null;
    hasSchedule: boolean;
  }[];
}

/**
 * Every group a signed-in user has a member row in — what the profile page
 * edits. Ownerless rows are invisible here by design: nothing ties them to a
 * user until they're claimed from the group page.
 */
export async function listMembershipsForUser(userId: number): Promise<Membership[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT m.id AS member_id, m.display_name, m.color,
           g.id AS group_id, g.code, g.name, g.term,
           COALESCE(ARRAY_AGG(mc.class_number) FILTER (WHERE mc.class_number IS NOT NULL), '{}') AS class_numbers
    FROM meetup.members m
    JOIN meetup.groups g ON g.id = m.group_id
    LEFT JOIN meetup.member_courses mc ON mc.member_id = m.id
    WHERE m.user_id = ${userId}
    GROUP BY m.id, g.id
    ORDER BY g.created_at DESC
  `;
  if (rows.length === 0) return [];

  // One round trip for every group's roster, rather than one per group.
  const groupIds = rows.map((r) => r.group_id as number);
  const roster = await sql`
    SELECT m.group_id, m.id, m.display_name, m.color,
           COALESCE(u.avatar, u.image) AS image,
           EXISTS (SELECT 1 FROM meetup.member_courses mc WHERE mc.member_id = m.id) AS has_schedule
    FROM meetup.members m
    LEFT JOIN meetup.users u ON u.id = m.user_id
    WHERE m.group_id = ANY(${groupIds}::int[])
    ORDER BY m.id
  `;

  return rows.map((r) => ({
    memberId: r.member_id,
    displayName: r.display_name,
    color: r.color,
    classNumbers: r.class_numbers as string[],
    group: { id: r.group_id, code: r.code, name: r.name, term: r.term },
    members: roster
      .filter((x) => x.group_id === r.group_id)
      .map((x) => ({
        id: x.id,
        displayName: x.display_name,
        color: x.color,
        image: x.image ?? null,
        hasSchedule: x.has_schedule,
      })),
  }));
}

/** Add one section to a member's schedule. Adding it twice is a no-op. */
export async function addMemberCourse(
  memberId: number,
  classNumber: string
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO meetup.member_courses (member_id, class_number)
    VALUES (${memberId}, ${classNumber})
    ON CONFLICT DO NOTHING
  `;
}

export async function removeMemberCourse(
  memberId: number,
  classNumber: string
): Promise<void> {
  const sql = getDb();
  await sql`
    DELETE FROM meetup.member_courses
    WHERE member_id = ${memberId} AND class_number = ${classNumber}
  `;
}

export async function getMemberCourses(memberId: number): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT class_number FROM meetup.member_courses WHERE member_id = ${memberId}
    ORDER BY class_number
  `;
  return rows.map((r) => r.class_number as string);
}
