// Writing iCalendar (RFC 5545), with no knowledge of this app's domain.
//
// Hand-rolled rather than pulled from npm: what a timetable needs is a narrow
// slice of the spec — VEVENT, one VTIMEZONE, weekly RRULE — and the libraries
// that cover the whole of it are large and mostly dead weight here. The parts
// that actually bite (line folding, the escape rules, and UNTIL being UTC even
// when DTSTART is not) are all in this file, so they can be tested directly.
//
// There is no reader. Nothing imports calendars yet, and a parser kept warm for
// a feature that may not arrive is just code nobody is checking.

/** Wall-clock time with no zone attached. Minutes only; seconds are always 0. */
export interface DateTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second?: number;
}

/** RFC 5545 weekday abbreviations, which are not this codebase's DayKey. */
export const ICS_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type IcsDay = (typeof ICS_DAYS)[number];

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

/**
 * The America/Vancouver rules, written out as a VTIMEZONE. The RRULEs are the
 * post-2007 North American DST rule — second Sunday in March, first Sunday in
 * November — which is what every date this app can produce falls under.
 *
 * A calendar that references a TZID without defining it is technically invalid,
 * and in practice some clients will silently drop the events.
 */
export const VANCOUVER_TZID = "America/Vancouver";

const VANCOUVER_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${VANCOUVER_TZID}`,
  "X-LIC-LOCATION:America/Vancouver",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/**
 * How far `zone` is from UTC at the instant `utc`, in minutes (PDT is -420).
 * Intl already carries the full tz database, so this needs no lookup table and
 * stays right for dates outside the current DST rule.
 */
function zoneOffsetMinutes(utc: Date, zone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(utc)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  // "24" for midnight is legal in en-US hour12:false output on some engines.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    parts.minute,
    parts.second
  );
  return (asUTC - utc.getTime()) / 60000;
}

/**
 * Wall-clock time in `zone` to the instant it names.
 *
 * Two passes: the offset depends on the instant, and the instant is what we're
 * solving for. The first guess is only wrong across a DST boundary, and the
 * second pass fixes it — the standard trick, and the reason this isn't a
 * one-liner.
 */
export function zonedToUtc(parts: DateTimeParts, zone: string): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0
  );
  const first = zoneOffsetMinutes(new Date(naive), zone);
  const candidate = naive - first * 60000;
  const second = zoneOffsetMinutes(new Date(candidate), zone);
  return second === first ? new Date(candidate) : new Date(naive - second * 60000);
}

// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------

/**
 * Backslash, semicolon and comma are separators inside a property value, and a
 * newline has to survive as the two characters "\n". Order matters: the
 * backslash rule has to run first or it escapes its own output.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Content lines are capped at 75 octets, continued by a line starting with one
 * space. The limit is octets, not characters, so an accented course title has
 * to be measured after UTF-8 encoding — and never split mid-codepoint.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const pieces: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line gets 75 octets; continuations lose one to the leading space.
  let budget = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > budget) {
      pieces.push(current);
      current = "";
      currentBytes = 0;
      budget = 74;
    }
    current += char;
    currentBytes += size;
  }
  if (current) pieces.push(current);

  return pieces.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n");
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** 20250903T103000 — the form used for both floating and TZID-qualified times. */
export function formatLocal(parts: DateTimeParts): string {
  return (
    `${pad(parts.year, 4)}${pad(parts.month)}${pad(parts.day)}` +
    `T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second ?? 0)}`
  );
}

/** 20250903T173000Z */
export function formatUtc(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export interface WeeklyRecurrence {
  byDay: IcsDay[];
  /** Last moment an occurrence may start. RFC 5545 requires this in UTC. */
  until: Date;
}

export interface OutgoingEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** Wall-clock, interpreted in VANCOUVER_TZID. */
  start: DateTimeParts;
  end: DateTimeParts;
  recur?: WeeklyRecurrence;
}

export interface CalendarOptions {
  /** Shown as the calendar's name by clients that subscribe rather than import. */
  name: string;
  /** Fixed by the caller so a re-export of unchanged data is byte-identical. */
  stamp: Date;
}

/**
 * A VCALENDAR of timed, optionally weekly-recurring events.
 *
 * Every DTSTART/DTEND carries `TZID=America/Vancouver` rather than being
 * converted to UTC. A class is a wall-clock commitment: 10:30 stays 10:30 when
 * the clocks change in November, which they always do mid-term. Written as UTC,
 * a weekly RRULE anchored in PDT would slide an hour for the back half of the
 * fall semester — the kind of break nobody notices until they miss a lab.
 * Floating time (no TZID at all) survives DST too, but then a calendar opened
 * in another zone reads the times as its own, so an exchange student's laptop
 * shows the wrong morning.
 *
 * UNTIL is the exception and is always UTC, because RFC 5545 says so outright.
 */
export function buildCalendar(
  events: OutgoingEvent[],
  { name, stamp }: CalendarOptions
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//meetup-sfu//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${VANCOUVER_TZID}`,
    ...VANCOUVER_VTIMEZONE,
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${formatUtc(stamp)}`,
      `DTSTART;TZID=${VANCOUVER_TZID}:${formatLocal(event.start)}`,
      `DTEND;TZID=${VANCOUVER_TZID}:${formatLocal(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.recur) {
      lines.push(
        `RRULE:FREQ=WEEKLY;BYDAY=${event.recur.byDay.join(",")};UNTIL=${formatUtc(event.recur.until)}`
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // CRLF throughout, and a trailing one: some parsers drop the last line without it.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
