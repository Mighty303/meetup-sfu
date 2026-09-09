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

/**
 * A section trimmed to what a picker needs to show. The full term dump is
 * ~1.5 MB; this is what actually crosses the wire.
 */
export interface SectionHit {
  classNumber: string;
  section: string; // D100
  deliveryMethod: string;
  instructor: string;
  meetings: {
    days: string; // "Mo, We" — empty for async
    startTime: string;
    endTime: string;
    campus: string;
    sectionCode: string; // LEC, LAB, TUT, ...
  }[];
}

export interface CourseHit {
  dept: string;
  number: string;
  title: string;
  units: string;
  sections: SectionHit[];
}

function slimCourse(course: CourseWithSections, sections: SectionDetail[]): CourseHit {
  return {
    dept: course.dept,
    number: course.number,
    title: course.title,
    units: course.units,
    sections: sections.map((s) => ({
      classNumber: s.classNumber,
      section: s.section,
      deliveryMethod: s.deliveryMethod,
      instructor: s.instructors[0]?.name.trim() ?? "",
      meetings: s.schedules.map((sc) => ({
        days: sc.days,
        startTime: sc.startTime,
        endTime: sc.endTime,
        campus: sc.campus,
        sectionCode: sc.sectionCode,
      })),
    })),
  };
}

/** "cmpt 225", "CMPT225", "225", "data structures" all have to work. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Course search over a term dump. Matches on the course code first — that's
 * what people type — and falls back to the title so "calculus" finds MATH 151.
 * Sorted so a code match outranks a title match, then by dept and number.
 */
export function searchCourses(
  courses: CourseWithSections[],
  query: string,
  limit = 20
): CourseHit[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored: { course: CourseWithSections; score: number }[] = [];
  for (const course of courses) {
    const code = normalize(`${course.dept}${course.number}`);
    const title = course.title.toLowerCase();

    let score: number;
    if (code === q) score = 0;
    else if (code.startsWith(q)) score = 1;
    else if (code.includes(q)) score = 2;
    else if (words.every((w) => title.includes(w))) score = 3;
    else continue;

    scored.push({ course, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.course.dept.localeCompare(b.course.dept) ||
      a.course.number.localeCompare(b.course.number, undefined, { numeric: true })
  );

  return scored.slice(0, limit).map(({ course }) => slimCourse(course, course.sections));
}

/**
 * Look up saved class numbers so they can be shown as "CMPT 225 D100" rather
 * than a bare id. Unknown numbers are skipped — they're usually a section saved
 * under a different term, which the group page already flags.
 */
export function coursesByClassNumbers(
  courses: CourseWithSections[],
  classNumbers: string[]
): CourseHit[] {
  const wanted = new Set(classNumbers);
  const hits: CourseHit[] = [];
  for (const course of courses) {
    const matched = course.sections.filter((s) => wanted.has(s.classNumber));
    if (matched.length > 0) hits.push(slimCourse(course, matched));
  }
  return hits;
}
