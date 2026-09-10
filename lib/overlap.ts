// Interval math for "when is everyone free at the same time".
//
// All times are minutes since midnight, local to campus. A day is handled
// independently — nothing here crosses midnight, because classes don't.

import {
  DAYS,
  WEEKDAYS,
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
  /** Split for display: "CMPT 225" reads first, "D100 LEC" is secondary. */
  course: string;
  detail: string;
  /**
   * The section this came from. Set for course blocks, absent on custom busy
   * time — two people's "Busy" is not the same event, but two people's 4906 is.
   */
  classNumber?: string;
}

export interface FreeWindow extends Interval {
  day: DayKey;
  /** Distinct campuses the members are anchored to around this window. */
  campuses: string[];
  /** False when members are anchored to different campuses — they can't meet in person. */
  sharedCampus: boolean;
  /**
   * True when a class ends where this window starts and another begins where it
   * ends — a gap wedged between classes. Everyone is already on campus with
   * somewhere to be afterwards, which is a very different proposition from
   * "free after 4pm", so it gets its own treatment in the UI.
   */
  betweenClasses: boolean;
  /**
   * Of the people this window is for, the ones who have a class that day — so
   * they're on campus already. Someone with no classes that day is free from
   * morning to night and would have to make the trip specially, so they're left
   * out: two names here means a meetup nobody has to travel for.
   */
  onCampus: string[];
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
          course: `${course.dept} ${course.number}`,
          detail: `${section.section} ${sched.sectionCode}`,
          classNumber: section.classNumber,
        });
      }
    }
  }
  return blocks;
}

export interface UnscheduledSection {
  classNumber: string;
  course: string; // "CMPT 300"
  section: string; // "D100"
  sectionCode: string; // LEC, IND, OLC, COP...
  deliveryMethod: string; // In Person, Online, Blended
}

/**
 * Sections a member is enrolled in that never meet at a fixed time — online and
 * async courses, but also independent study, co-op and capstone, which are
 * "In Person" yet have no timetable slot. They can't block or free any part of
 * the week, so they'd otherwise vanish from the app entirely.
 */
export function unscheduledFromCourses(
  index: Map<string, { course: CourseWithSections; section: SectionDetail }>,
  classNumbers: string[]
): UnscheduledSection[] {
  const out: UnscheduledSection[] = [];
  for (const classNumber of classNumbers) {
    const hit = index.get(classNumber);
    if (!hit) continue;
    const { course, section } = hit;
    if (section.schedules.some((s) => s.days.trim())) continue;
    out.push({
      classNumber,
      course: `${course.dept} ${course.number}`,
      section: section.section,
      sectionCode: section.schedules[0]?.sectionCode ?? "",
      deliveryMethod: section.deliveryMethod,
    });
  }
  return out;
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

export interface MemberSchedule {
  /** Shown against the windows this member is free for. */
  name: string;
  /** Every busy block they have this week. */
  busy: BusyBlock[];
}

export interface CommonFreeOptions {
  /** One entry per member. */
  members: MemberSchedule[];
  /** Search window inside each day, e.g. 08:00–22:00. */
  dayStart: number;
  dayEnd: number;
  /** Windows shorter than this aren't worth walking to campus for. */
  minMinutes: number;
  /** Defaults to Mon–Fri. */
  days?: readonly DayKey[];
}

export function commonFree({
  members,
  dayStart,
  dayEnd,
  minMinutes,
  days = WEEKDAYS,
}: CommonFreeOptions): FreeWindow[] {
  if (members.length === 0) return [];
  const windows: FreeWindow[] = [];

  for (const day of days) {
    const dayBusy = members.map((m) => m.busy.filter((b) => b.day === day));
    const onCampus = members
      .filter((_, i) => dayBusy[i].length > 0)
      .map((m) => m.name);
    const allBlocks = dayBusy.flat();

    const perMemberFree = dayBusy.map((busy) =>
      complement(busy, { start: dayStart, end: dayEnd })
    );

    for (const slot of intersectAll(perMemberFree)) {
      if (slot.end - slot.start < minMinutes) continue;

      const campuses = [
        ...new Set(
          dayBusy
            .map((busy) => anchorCampus(busy, slot))
            .filter((c): c is string => c !== null)
        ),
      ];

      windows.push({
        day,
        start: slot.start,
        end: slot.end,
        campuses,
        sharedCampus: campuses.length <= 1,
        // Windows are maximal, so an edge that isn't the day boundary is always
        // a class boundary — but check for the class directly rather than
        // inferring it from dayStart/dayEnd, which only holds by construction.
        betweenClasses:
          allBlocks.some((b) => b.end === slot.start) &&
          allBlocks.some((b) => b.start === slot.end),
        onCampus,
      });
    }
  }

  return windows;
}

export interface PartialWindow extends FreeWindow {
  /** Everyone free for the whole window — always at least `minAttendees` of them. */
  attendees: string[];
  /** True when that's the entire group, i.e. the same window `commonFree` reports. */
  everyone: boolean;
}

/** Does `set` contain every member of `subset`? */
function covers(set: Set<number>, subset: number[]): boolean {
  return subset.every((x) => set.has(x));
}

export interface PartialFreeOptions extends CommonFreeOptions {
  /** Fewer than two people isn't a meetup. Raising it demands a bigger turnout. */
  minAttendees?: number;
}

/**
 * Windows where *some* of the group can meet, not necessarily all of it.
 *
 * With four or five schedules there is often no minute all week that every
 * single person is free, and the answer "nothing works" is worse than useless —
 * three of them could still have met on Tuesday. This reports every maximal
 * (people, time) pairing: a window is kept only when it can't be stretched
 * without losing someone, and can't gain a person without shrinking.
 *
 * Full-group windows come back too, flagged `everyone`, so a caller that
 * already lists those can drop them and show the rest underneath.
 */
export function partialFree({
  members,
  dayStart,
  dayEnd,
  minMinutes,
  days = WEEKDAYS,
  minAttendees = 2,
}: PartialFreeOptions): PartialWindow[] {
  const need = Math.max(minAttendees, 2);
  if (members.length < need) return [];
  const windows: PartialWindow[] = [];

  for (const day of days) {
    const dayBusy = members.map((m) => m.busy.filter((b) => b.day === day));

    // Cut the day at every class edge. Nobody's status changes inside a segment,
    // so any window is a run of whole segments — which makes the search a walk
    // over runs instead of over 2^n subsets of the group.
    const cuts = new Set<number>([dayStart, dayEnd]);
    for (const busy of dayBusy) {
      for (const b of busy) {
        if (b.start > dayStart && b.start < dayEnd) cuts.add(b.start);
        if (b.end > dayStart && b.end < dayEnd) cuts.add(b.end);
      }
    }
    const edges = [...cuts].sort((a, b) => a - b);

    const segs = edges.slice(0, -1).map((start, i) => {
      const end = edges[i + 1];
      const free = new Set<number>();
      dayBusy.forEach((busy, mi) => {
        if (!busy.some((b) => b.start < end && b.end > start)) free.add(mi);
      });
      return { start, end, free };
    });

    for (let i = 0; i < segs.length; i++) {
      let attending = [...segs[i].free];
      for (let j = i; j < segs.length; j++) {
        if (j > i) attending = attending.filter((x) => segs[j].free.has(x));
        if (attending.length < need) break; // only shrinks from here

        const start = segs[i].start;
        const end = segs[j].end;
        if (end - start < minMinutes) continue;

        // Maximal only. If the neighbouring segment keeps this same crowd free,
        // the real window is the longer one — this run is a fragment of it.
        if (i > 0 && covers(segs[i - 1].free, attending)) continue;
        if (j < segs.length - 1 && covers(segs[j + 1].free, attending)) continue;

        const busyLists = attending.map((mi) => dayBusy[mi]);
        const campuses = [
          ...new Set(
            busyLists
              .map((busy) => anchorCampus(busy, { start, end }))
              .filter((c): c is string => c !== null)
          ),
        ];
        const blocks = busyLists.flat();

        windows.push({
          day,
          start,
          end,
          campuses,
          sharedCampus: campuses.length <= 1,
          betweenClasses:
            blocks.some((b) => b.end === start) && blocks.some((b) => b.start === end),
          onCampus: attending.filter((mi) => dayBusy[mi].length > 0).map((mi) => members[mi].name),
          attendees: attending.map((mi) => members[mi].name),
          everyone: attending.length === members.length,
        });
      }
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
