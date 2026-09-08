// Client for the public sfucourses API. No key, CORS is open, responses are
// brotli/gzip encoded and decoded by fetch automatically.

const API = "https://api.sfucourses.com/v1/rest";

export const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
export type DayKey = (typeof DAYS)[number];

/**
 * Meetups are on campus between classes, so the week is Mon–Fri. Weekend
 * sections still parse and still count as busy time; they just aren't days we
 * look for a meetup on.
 */
export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr"] as const satisfies readonly DayKey[];

export interface SectionSchedule {
  startDate: string; // 2025-09-03
  endDate: string; // 2025-12-02
  campus: string; // Burnaby, Surrey, Vancouver, SEGAL, GOLDCORP, DT VSAR, or ""
  days: string; // "Mo, We" — empty for async sections
  startTime: string; // "10:30"
  endTime: string; // "11:20"
  sectionCode: string; // LEC, LAB, TUT, SEM, ...
}

export interface SectionDetail {
  section: string; // D100
  deliveryMethod: string;
  classNumber: string; // 5446 — the id we persist
  instructors: { name: string; email: string }[];
  schedules: SectionSchedule[];
}

export interface CourseWithSections {
  dept: string;
  number: string;
  title: string;
  units: string;
  term: string; // "Fall 2025"
  sections: SectionDetail[];
}

/** "Fall 2025" -> "2025-fall" (the shape the API's term param wants). */
export function toTermCode(label: string): string {
  return label.toLowerCase().split(" ").reverse().join("-");
}

/** "2025-fall" -> "Fall 2025" */
export function fromTermCode(code: string): string {
  const [year, season] = code.split("-");
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 12-hour label for display: 810 -> "1:30 PM" */
export function formatTime(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Mo, We" -> ["Mo","We"]. Async sections have an empty string and yield []. */
export function parseDays(days: string): DayKey[] {
  return days
    .split(",")
    .map((d) => d.trim())
    .filter((d): d is DayKey => (DAYS as readonly string[]).includes(d));
}

export async function fetchTermSections(
  term: string
): Promise<CourseWithSections[]> {
  const res = await fetch(`${API}/sections?term=${encodeURIComponent(term)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`sfucourses API ${res.status} for term ${term}`);
  }
  return res.json();
}

/**
 * Pull class numbers out of whatever a friend pastes: a full sfucourses.com
 * schedule link (?courses=5446-5447-6127), the bare dash-joined list, or a
 * comma/space separated list they typed by hand.
 */
export function parseScheduleInput(input: string): string[] {
  let raw = input.trim();

  try {
    const url = new URL(raw);
    raw = url.searchParams.get("courses") ?? "";
  } catch {
    // Not a URL — treat the whole string as the list.
  }

  const seen = new Set<string>();
  for (const part of raw.split(/[-,\s]+/)) {
    const n = part.trim();
    if (/^\d{3,6}$/.test(n)) seen.add(n);
  }
  return [...seen];
}

/** Index a term dump by class number so lookups are O(1) per saved course. */
export function indexByClassNumber(
  courses: CourseWithSections[]
): Map<string, { course: CourseWithSections; section: SectionDetail }> {
  const index = new Map<
    string,
    { course: CourseWithSections; section: SectionDetail }
  >();
  for (const course of courses) {
    for (const section of course.sections) {
      index.set(section.classNumber, { course, section });
    }
  }
  return index;
}

/** SFU terms: Spring Jan–Apr, Summer May–Aug, Fall Sep–Dec. */
export function currentTermCode(date = new Date()): string {
  const month = date.getMonth(); // 0-indexed
  const season = month <= 3 ? "spring" : month <= 7 ? "summer" : "fall";
  return `${date.getFullYear()}-${season}`;
}

/**
 * Link to the sfucourses.com schedule builder, pre-set to a term.
 *
 * That page encodes the term as fa/sp/su + a 2-digit year, and only honours it
 * for the current and next term — anything older falls back to its default,
 * which is harmless since the link is just a starting point.
 */
export function scheduleBuilderUrl(termCode: string): string {
  const [year, season] = termCode.split("-");
  const short: Record<string, string> = { spring: "sp", summer: "su", fall: "fa" };
  const param = short[season] ? `${short[season]}${year.slice(-2)}` : "";
  return `https://sfucourses.com/schedule${param ? `?term=${param}` : ""}`;
}
