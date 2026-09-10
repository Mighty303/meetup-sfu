// The bridge between this app's model of a week and an iCalendar file.
//
// lib/ical.ts knows RFC 5545 and nothing else; this knows about sections, terms
// and free windows and nothing about line folding. Everything here is pure —
// the routes fetch the term dump and hand it in.

import {
  DAYS,
  type CourseWithSections,
  type DayKey,
  type SectionDetail,
  fromTermCode,
  parseDays,
  toMinutes,
} from "./sfu";
import type { FreeWindow } from "./overlap";
import {
  ICS_DAYS,
  VANCOUVER_TZID,
  buildCalendar,
  zonedToUtc,
  type DateTimeParts,
  type IcsDay,
  type OutgoingEvent,
} from "./ical";

/** DAYS and ICS_DAYS are the same week in different notation. */
function toIcsDay(day: DayKey): IcsDay {
  return ICS_DAYS[DAYS.indexOf(day)];
}

/** 2025-09-03 -> "We". Parsed as UTC so the local zone can't shift the date. */
export function weekdayOf(isoDate: string): DayKey | null {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // getUTCDay is Sun=0; DAYS starts at Monday.
  return DAYS[(new Date(ms).getUTCDay() + 6) % 7];
}

function partsOf(isoDate: string, minutes: number): DateTimeParts {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * How many times any of `days` falls inside the inclusive date range. Block
 * sessions — a seminar meeting on four scattered Mondays — arrive as one
 * schedule row per date, so plenty of rows resolve to a single meeting.
 */
export function occurrenceCount(
  startDate: string,
  endDate: string,
  days: DayKey[]
): number {
  let count = 0;
  for (const day of days) {
    const first = firstOccurrence(startDate, day);
    if (first > endDate) continue;
    const spanDays =
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000;
    count += Math.floor(spanDays / 7) + 1;
  }
  return count;
}

/** The first date on or after `from` that falls on `day`. */
export function firstOccurrence(from: string, day: DayKey): string {
  const start = weekdayOf(from);
  if (!start) return from;
  const shift = (DAYS.indexOf(day) - DAYS.indexOf(start) + 7) % 7;
  return addDays(from, shift);
}

/**
 * The last moment a weekly occurrence may start, as the UTC stamp RRULE wants.
 * End of day on the section's last date, so the final class is included however
 * late it runs.
 */
function untilFor(endDate: string): Date {
  const [year, month, day] = endDate.split("-").map(Number);
  return zonedToUtc(
    { year, month, day, hour: 23, minute: 59, second: 59 },
    VANCOUVER_TZID
  );
}

// ---------------------------------------------------------------------------
// Export: your timetable
// ---------------------------------------------------------------------------

export interface TimetableCalendarOptions {
  /** Only sections in here are exported; unknown numbers are silently stale. */
  index: Map<string, { course: CourseWithSections; section: SectionDetail }>;
  classNumbers: string[];
  groupName: string;
  term: string;
  stamp?: Date;
}

/**
 * Your saved sections as a subscribable week.
 *
 * One VEVENT per schedule row rather than per meeting: a section that meets
 * Monday and Wednesday at the same hour is a single weekly event with
 * `BYDAY=MO,WE`, which is both smaller and what the section actually is. A row
 * with no days and no times is an async section — no timetable slot to export,
 * and emitting one would put a midnight event on somebody's calendar.
 */
export function timetableCalendar({
  index,
  classNumbers,
  groupName,
  term,
  stamp = new Date(),
}: TimetableCalendarOptions): string {
  const events: OutgoingEvent[] = [];

  for (const classNumber of classNumbers) {
    const hit = index.get(classNumber);
    if (!hit) continue;
    const { course, section } = hit;

    section.schedules.forEach((sched, i) => {
      const days = parseDays(sched.days);
      if (days.length === 0) return; // async: nothing meets, nothing to export
      if (!sched.startTime || !sched.endTime) return;
      if (!sched.startDate || !sched.endDate) return;

      const start = toMinutes(sched.startTime);
      const end = toMinutes(sched.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

      // DTSTART has to land on one of the BYDAY days or clients disagree about
      // whether it counts as an occurrence, so anchor on the earliest of them.
      const anchorDay = days
        .map((d) => ({ day: d, date: firstOccurrence(sched.startDate, d) }))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (anchorDay.date > sched.endDate) return; // term already over

      const code = `${course.dept} ${course.number}`;
      const detail = `${section.section} ${sched.sectionCode}`.trim();

      events.push({
        uid: `${classNumber}-${i}-${anchorDay.date}@meetup-sfu`,
        summary: `${code} ${detail}`.trim(),
        description: [course.title, section.instructors[0]?.name.trim()]
          .filter(Boolean)
          .join(" · "),
        location: sched.campus.trim() || undefined,
        start: partsOf(anchorDay.date, start),
        end: partsOf(anchorDay.date, end),
        // A row that only ever meets once is a single event, not a weekly rule
        // that stops after one hit. Block sessions and one-off makeup classes
        // both land here, and clients render the plain event more predictably.
        recur:
          occurrenceCount(anchorDay.date, sched.endDate, days) > 1
            ? { byDay: days.map(toIcsDay), until: untilFor(sched.endDate) }
            : undefined,
      });
    });
  }

  return buildCalendar(events, {
    name: `${groupName} — my timetable (${fromTermCode(term)})`,
    stamp,
  });
}

// ---------------------------------------------------------------------------
// Export: the group's free windows
// ---------------------------------------------------------------------------

export interface WindowsCalendarOptions {
  windows: FreeWindow[];
  /** Monday of the week the windows were computed for, as YYYY-MM-DD. */
  weekStart: string;
  groupName: string;
  term: string;
  stamp?: Date;
}

/**
 * The week's free windows as events you can drop into a calendar.
 *
 * These do not recur, and that's deliberate. The app recomputes overlap for one
 * week at a time — a window only holds while everyone's sections run, and those
 * date ranges end at different times. Repeating them to the end of term would
 * assert something nobody calculated.
 */
export function windowsCalendar({
  windows,
  weekStart,
  groupName,
  term,
  stamp = new Date(),
}: WindowsCalendarOptions): string {
  const events: OutgoingEvent[] = windows.map((w, i) => {
    const date = addDays(weekStart, DAYS.indexOf(w.day));
    const where = w.sharedCampus ? w.campuses[0] : w.campuses.join(" / ");
    return {
      uid: `free-${weekStart}-${w.day}-${w.start}-${i}@meetup-sfu`,
      summary: w.betweenClasses
        ? `Free — ${groupName} (between classes)`
        : `Free — ${groupName}`,
      description: [
        w.onCampus.length > 0
          ? `On campus already: ${w.onCampus.join(", ")}`
          : "Nobody has class this day — someone has to travel",
        "Computed by meetup-sfu for this week only.",
      ].join("\n"),
      location: where || undefined,
      start: partsOf(date, w.start),
      end: partsOf(date, w.end),
    };
  });

  return buildCalendar(events, {
    name: `${groupName} — free windows (${fromTermCode(term)})`,
    stamp,
  });
}
