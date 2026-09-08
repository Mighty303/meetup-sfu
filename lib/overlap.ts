// Interval math for "when is everyone free at the same time".
//
// All times are minutes since midnight, local to campus. A day is handled
// independently — nothing here crosses midnight, because classes don't.

import {
  DAYS,
  type DayKey,
  type CourseWithSections,
  type SectionDetail,
  parseDays,
  toMinutes,
} from "./sfu";

export interface Interval {
  start: number;
  end: number;
}

export interface BusyBlock extends Interval {
  day: DayKey;
  campus: string | null; // null for online/unspecified
  label: string; // "CMPT 225 D100 LEC" or a custom block's label
}

export interface FreeWindow extends Interval {
  day: DayKey;
  /** Distinct campuses the members are anchored to around this window. */
  campuses: string[];
  /** False when members are anchored to different campuses — they can't meet in person. */
  sharedCampus: boolean;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0] }];
  for (const cur of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    // Touching intervals (10:20 end, 10:20 start) merge — no free time between.
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** The gaps inside `window` not covered by `busy`. */
export function complement(busy: Interval[], window: Interval): Interval[] {
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= window.start || b.start >= window.end) continue;
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/** Pairwise intersection of two sorted, non-overlapping interval lists. */
export function intersectPair(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) out.push({ start, end });
    // Advance whichever ends first — the other may still overlap the next one.
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return out;
}

export function intersectAll(lists: Interval[][]): Interval[] {
  if (lists.length === 0) return [];
  return lists.reduce((acc, cur) => intersectPair(acc, cur));
}

/**
 * Monday-anchored dates for the week containing `date`, keyed by day.
 * Needed because a section only counts on days inside its startDate/endDate.
 */
export function weekDates(date: Date): Record<DayKey, string> {
  const monday = new Date(date);
  const shift = (monday.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  monday.setDate(monday.getDate() - shift);
  const out = {} as Record<DayKey, string>;
  DAYS.forEach((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out[day] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  return out;
}

/**
 * Expand one member's saved class numbers into busy blocks for a given week.
 * Sections whose date range doesn't cover that weekday are skipped, so a class
 * that ended in October doesn't block a November meetup.
 */
export function busyFromCourses(
  index: Map<string, { course: CourseWithSections; section: SectionDetail }>,
  classNumbers: string[],
  dates: Record<DayKey, string>
): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  for (const classNumber of classNumbers) {
    const hit = index.get(classNumber);
    if (!hit) continue; // stale class number from a previous term
    const { course, section } = hit;
    for (const sched of section.schedules) {
      if (!sched.startTime || !sched.endTime) continue;
      for (const day of parseDays(sched.days)) {
        const date = dates[day];
        if (date < sched.startDate || date > sched.endDate) continue;
        const start = toMinutes(sched.startTime);
        const end = toMinutes(sched.endTime);
        if (end <= start) continue;
        blocks.push({
          day,
          start,
          end,
          campus: sched.campus.trim() || null,
          label: `${course.dept} ${course.number} ${section.section} ${sched.sectionCode}`,
        });
      }
    }
  }
  return blocks;
}

/**
 * The campus a member is tied to around `window` on that day: whichever class
 * sits closest to it, preferring the one before (that's where they already are).
 * Null when they have no classes that day and could go anywhere.
 */
function anchorCampus(busy: BusyBlock[], window: Interval): string | null {
  let best: { gap: number; campus: string | null } | null = null;
  for (const b of busy) {
    if (b.campus === null) continue;
    let gap: number;
    if (b.end <= window.start) gap = window.start - b.end;
    else if (b.start >= window.end) gap = b.start - window.end + 0.5; // tie-break toward the earlier class
    else continue; // overlaps the window; shouldn't happen for a free window
    if (best === null || gap < best.gap) best = { gap, campus: b.campus };
  }
  return best?.campus ?? null;
}

export interface CommonFreeOptions {
  /** One entry per member: every busy block they have this week. */
  membersBusy: BusyBlock[][];
  /** Search window inside each day, e.g. 08:00–22:00. */
  dayStart: number;
  dayEnd: number;
  /** Windows shorter than this aren't worth walking to campus for. */
  minMinutes: number;
  days?: readonly DayKey[];
}

export function commonFree({
  membersBusy,
  dayStart,
  dayEnd,
  minMinutes,
  days = DAYS,
}: CommonFreeOptions): FreeWindow[] {
  if (membersBusy.length === 0) return [];
  const windows: FreeWindow[] = [];

  for (const day of days) {
    const perMemberFree = membersBusy.map((busy) =>
      complement(
        busy.filter((b) => b.day === day),
        { start: dayStart, end: dayEnd }
      )
    );

    for (const slot of intersectAll(perMemberFree)) {
      if (slot.end - slot.start < minMinutes) continue;

      const campuses = [
        ...new Set(
          membersBusy
            .map((busy) => anchorCampus(busy.filter((b) => b.day === day), slot))
            .filter((c): c is string => c !== null)
        ),
      ];

      windows.push({
        day,
        start: slot.start,
        end: slot.end,
        campuses,
        sharedCampus: campuses.length <= 1,
      });
    }
  }

  return windows;
}

export interface TermBounds {
  start: string;
  end: string;
  /** The date most sections begin — a handful of outliers start weeks early. */
  typicalStart: string;
}

/** Earliest start, latest end, and the modal start date across a term. */
export function termBounds(
  courses: { sections: { schedules: { startDate: string; endDate: string; days: string }[] }[] }[]
): TermBounds | null {
  let start: string | null = null;
  let end: string | null = null;
  const startCounts = new Map<string, number>();

  for (const course of courses) {
    for (const section of course.sections) {
      for (const s of section.schedules) {
        if (!s.days.trim() || !s.startDate || !s.endDate) continue;
        if (start === null || s.startDate < start) start = s.startDate;
        if (end === null || s.endDate > end) end = s.endDate;
        startCounts.set(s.startDate, (startCounts.get(s.startDate) ?? 0) + 1);
      }
    }
  }
  if (!start || !end) return null;

  let typicalStart = start;
  let best = 0;
  for (const [date, n] of startCounts) {
    if (n > best) { best = n; typicalStart = date; }
  }
  return { start, end, typicalStart };
}

/**
 * Keep the displayed week inside the term. Without this, a group created for a
 * future term defaults to today's week, every section is filtered out by date,
 * and the grid reads as "everyone free always" — technically true, useless.
 */
export function clampWeekToTerm(week: Date, bounds: TermBounds | null): Date {
  if (!bounds) return week;
  const dates = weekDates(week);
  if (dates.Su >= bounds.start && dates.Mo <= bounds.end) return week;
  // Outside the term in either direction: show the week most classes are running,
  // not the fringe week at whichever end happens to be nearer.
  return new Date(`${bounds.typicalStart}T12:00:00`);
}
