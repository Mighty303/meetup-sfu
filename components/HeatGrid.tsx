"use client";

import { useMemo } from "react";
import { HoverCard, useHoverCard } from "@/components/HoverCard";
import { NowLine, useNowMarker, useTodayColumn } from "@/components/NowLine";
import type { Member } from "@/components/WeekGrid";
import { COLUMN_HEIGHT, DAY_CELL, DAY_TRACK, GRID_SCROLLER, LEGEND_HEIGHT } from "@/lib/grid-layout";
import { availabilityBands, type AvailabilityBand, type BusyBlock } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

// Emerald, matching the "everyone free" green the detailed grid already uses.
const FILL = [16, 185, 129] as const;

/**
 * Stripes for the bands where someone is in class.
 *
 * A hatch rather than a second fill colour: the emerald ramp is the whole
 * reading of this view, and a solid grey heavy enough to notice would compete
 * with the pale end of it. A neutral at this alpha sits under both themes
 * without being told which one it's in.
 */
const IN_CLASS_HATCH =
  "repeating-linear-gradient(45deg, transparent 0 5px, rgba(128,128,128,0.16) 5px 10px)";

/**
 * Alpha for `n of total` free. Zero is left transparent so the column's own
 * background shows through — an empty band should read as the paper, not as a
 * very pale green. The floor at 0.12 keeps one person out of eight visible.
 */
function fillAlpha(free: number, total: number): number {
  if (free === 0 || total === 0) return 0;
  return 0.12 + 0.73 * (free / total);
}

/** "Ann, Bo, Cy" — and "+2" past three, so the label stays on one line. */
function nameList(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

/**
 * What is in the way during a band, per busy member and as a distinct list.
 *
 * The band itself only knows *who* is busy — `AvailabilityBand` carries indices,
 * not blocks — but the blocks are still in props, and a band is cut at class
 * edges, so an overlap test lands on whole classes and never half of one.
 *
 * Without this the view shades free time and draws nothing else, which leaves a
 * bare column meaning three different things: in class, not on campus yet, or no
 * class at all that day. Only the hover card could tell them apart.
 */
function coursesDuring(
  band: AvailabilityBand,
  memberIds: number[],
  busyByMember: Record<number, BusyBlock[]>
): { byMember: Map<number, string[]>; all: string[] } {
  const byMember = new Map<number, string[]>();
  const all: string[] = [];
  for (const i of band.busyIndices) {
    const mine: string[] = [];
    for (const b of busyByMember[memberIds[i]] ?? []) {
      if (b.day !== band.day || b.start >= band.end || b.end <= band.start) continue;
      if (!mine.includes(b.course)) mine.push(b.course);
      if (!all.includes(b.course)) all.push(b.course);
    }
    byMember.set(i, mine);
  }
  return { byMember, all };
}

/** 80 -> "1h 20m", 50 -> "50m" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface Props {
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  dayStart: number;
  dayEnd: number;
  /** One person's week: the ramp collapses to free/busy, and so does the wording. */
  solo?: boolean;
  /** Monday of the week on screen, as YYYY-MM-DD — places the "now" line. */
  weekStart?: string;
  /**
   * Height of the day columns. Defaults to the shared COLUMN_HEIGHT, which is
   * what keeps this and the detailed grid the same size behind their toggle —
   * only pass something else somewhere the two aren't swapped, like the home
   * page demo, where a full-height week is just a wall to scroll past.
   */
  columnHeight?: string;
}

/**
 * The week as a LettuceMeet-style heatmap: forget whose class is whose, and
 * shade each stretch of the day by how many people are free in it. The detailed
 * grid answers "what is Ann's Tuesday"; this one answers "when can we meet",
 * which `commonFree` can only answer when *literally everyone* is free.
 *
 * The bands are the same intervals the detailed grid draws — cut at real class
 * edges, not on a half-hour clock — so a green stretch here starts and ends at
 * the times the lists below the grid quote.
 */
export function HeatGrid({
  members,
  busyByMember,
  dayStart,
  dayEnd,
  solo = false,
  weekStart,
  columnHeight = COLUMN_HEIGHT,
}: Props) {
  const [hover, setHover] = useHoverCard();
  const now = useNowMarker(weekStart, dayStart, dayEnd);
  const { trackRef, todayIndex } = useTodayColumn(weekStart);

  // Only people with a schedule constrain anything; someone with nothing saved
  // would read as free all week and wash the whole grid green.
  const withSchedules = useMemo(
    () => members.filter((m) => (busyByMember[m.id] ?? []).length > 0),
    [members, busyByMember]
  );

  const bands = useMemo(
    () =>
      availabilityBands({
        members: withSchedules.map((m) => ({
          name: m.displayName,
          busy: busyByMember[m.id] ?? [],
        })),
        dayStart,
        dayEnd,
      }),
    [withSchedules, busyByMember, dayStart, dayEnd]
  );

  // Indices into `withSchedules` are what the bands speak in; this maps them
  // back to the member ids the blocks are keyed on.
  const memberIds = useMemo(() => withSchedules.map((m) => m.id), [withSchedules]);

  const total = withSchedules.length;
  // One swatch per person up to six, then a sampled ramp — a twelve-person
  // group doesn't need twelve legend chips to read as a gradient.
  const swatches = solo ? 2 : Math.min(total, 6) + 1;

  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;
  const heightPct = (mins: number) => (mins / span) * 100;

  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
        Nobody here has added a schedule yet, so there&apos;s nothing to shade.
        Add your courses above, or send someone the link to this group.
      </p>
    );
  }

  return (
    <div className={GRID_SCROLLER}>
      <div className="flex flex-col gap-2">
        {/* Legend. The ramp is sampled at the real group size, so the swatches
            are the exact shades on the grid rather than a generic gradient.
            Fixed height, and matched by the detailed grid's own legend, so
            switching between the two views doesn't move the page under you. */}
        <div
          className={`flex flex-col items-center justify-center gap-1 text-xs ${LEGEND_HEIGHT}`}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="text-neutral-500">{solo ? "In class" : `0/${total} free`}</span>
            <span className="flex overflow-hidden rounded-sm border border-neutral-300 dark:border-neutral-700">
              {Array.from({ length: swatches }, (_, i) => (
                <span
                  key={i}
                  className="h-3.5 w-6"
                  style={{
                    backgroundColor: `rgba(${FILL.join(",")},${fillAlpha((i / (swatches - 1)) * total, total)})`,
                  }}
                />
              ))}
            </span>
            <span className="text-neutral-500">{solo ? "Free" : `${total}/${total} free`}</span>
            <span className="text-neutral-400 dark:text-neutral-500">
              · hover a band {solo ? "for the time" : "to see who"}
            </span>
          </div>
          {/* The two unshaded states. Without a key for them a blank Monday and
              a blank morning read as a bug rather than as the point of the
              view, and a hatched band reads as a rendering fault. The reason
              the mornings are blank is a sentence long, so it lives in the
              swatch's title rather than on a third line — the legend is pinned
              to LEGEND_HEIGHT so this view and the detailed one stay the same
              height behind their toggle. */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 text-neutral-400 dark:text-neutral-500">
            <span className="flex items-center gap-1">
              <span
                className="h-3.5 w-6 rounded-sm border border-neutral-300 dark:border-neutral-700"
                style={{ backgroundImage: IN_CLASS_HATCH }}
              />
              in class
            </span>
            <span
              className="flex items-center gap-1"
              title="Before their first class, or after the day's last — they'd be making the trip specially"
            >
              <span className="h-3.5 w-6 rounded-sm border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900" />
              nobody on campus
            </span>
          </div>
        </div>

        <div className="flex gap-2 text-xs">
          {/* Hour gutter. The empty header mirrors the day-name row so the hour
              labels line up with the grid lines, and its width matches the
              detailed grid's so the two views don't shift when you toggle. */}
          <div className="w-12 shrink-0">
            <div className="mb-1 text-center font-medium" aria-hidden>&nbsp;</div>
            <div className={`relative ${columnHeight}`}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-neutral-500 tabular-nums"
                  style={{ top: `${pct(h)}%` }}
                >
                  {formatTime(h).replace(":00", "")}
                </div>
              ))}
            </div>
          </div>

          <div ref={trackRef} className={DAY_TRACK}>
            {WEEKDAYS.map((day, dayIndex) => (
              <div key={day} className={DAY_CELL}>
                <div
                  className={`mb-1 text-center font-medium ${
                    dayIndex === todayIndex
                      ? "text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-600 dark:text-neutral-300"
                  }`}
                >
                  {LABELS[day]}
                  {/* On a phone only one day is on screen, so the header is the
                      only thing saying which. */}
                  {dayIndex === todayIndex && <span className="ml-1 text-red-500">•</span>}
                </div>
                <div
                  className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${columnHeight}`}
                >
                  {/* Behind the bands, so the hour lines stay readable through
                      the pale end of the ramp and vanish under the dark end. */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
                      style={{ top: `${pct(h)}%` }}
                    />
                  ))}

                  {bands
                    .filter((b) => b.day === day)
                    .map((band) => {
                      const minutes = band.end - band.start;
                      const free = band.freeIndices.length;
                      const freeNames = band.freeIndices.map((i) => withSchedules[i].displayName);
                      const busyNames = band.busyIndices.map((i) => withSchedules[i].displayName);
                      const awayNames = band.awayIndices.map((i) => withSchedules[i].displayName);
                      const outsideNames = band.outsideIndices.map((i) => withSchedules[i].displayName);
                      // Nobody free and someone in class: the band is a class,
                      // so say which one instead of leaving it bare.
                      const inClass = free === 0 && band.busyIndices.length > 0;
                      const courses = inClass || busyNames.length > 0
                        ? coursesDuring(band, memberIds, busyByMember)
                        : null;
                      /**
                       * "Martin, Angus Cheng · CMPT 365" rather than naming the
                       * course once per person — a lecture is the common case,
                       * and repeating it wrapped the line for no information.
                       * Null when the title already carries the courses, when
                       * there are too many people for the card to hold them, or
                       * when nobody is in class at all.
                       */
                      const busyCourseLine = ((): string | null => {
                        if (inClass || !courses || band.busyIndices.length === 0) return null;
                        if (band.busyIndices.length > 3) return null;
                        const sig = (i: number) => (courses.byMember.get(i) ?? []).join(", ");
                        const first = sig(band.busyIndices[0]);
                        if (first === "") return null;
                        return band.busyIndices.every((i) => sig(i) === first)
                          ? `${busyNames.join(", ")} · ${first}`
                          : band.busyIndices
                              .map((i) => {
                                const c = sig(i);
                                const name = withSchedules[i].displayName;
                                return c === "" ? name : `${name} · ${c}`;
                              })
                              .join(", ");
                      })();
                      // Naming everyone under a "7/7" only repeats the count in
                      // longer form. Names earn their line when the band is
                      // split, which is when you actually need to know who.
                      const showNames = !solo && free > 0 && free < total && minutes >= 55;
                      // Near the top of the ramp the list is mostly "+4", which
                      // spends a line to say nothing: on a 7/8 the fact you want
                      // is the one person who can't make it. Only worth
                      // inverting in a group big enough for the plain list to
                      // have been truncated in the first place.
                      const missingNames =
                        total >= 5 && total - free <= 2
                          ? withSchedules
                              .filter((_, i) => !band.freeIndices.includes(i))
                              .map((m) => m.displayName)
                          : null;
                      return (
                        <div
                          key={band.start}
                          // A ring on the between-classes bands rather than a
                          // different hue: the ramp already carries the count,
                          // and a second colour would compete with it.
                          className="absolute inset-x-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden px-1 text-center leading-tight"
                          style={{
                            top: `${pct(band.start)}%`,
                            height: `${heightPct(minutes)}%`,
                            // The ramp stays honest — a class is still zero
                            // people free — and the stripes go over the top of
                            // it rather than instead of it.
                            backgroundColor: `rgba(${FILL.join(",")},${fillAlpha(free, total)})`,
                            backgroundImage: inClass ? IN_CLASS_HATCH : undefined,
                          }}
                          onMouseEnter={(e) =>
                            setHover({
                              title: solo
                                ? free > 0
                                  ? "Gap between your classes"
                                  : busyNames.length > 0
                                    ? courses && courses.all.length > 0
                                      ? nameList(courses.all, 2)
                                      : "You have class"
                                    : awayNames.length > 0
                                      ? "No class today"
                                      : "Off campus"
                                : inClass && courses && courses.all.length > 0
                                  ? nameList(courses.all, 2)
                                  : `${free} of ${total} on campus and free`,
                              subtitle: LABELS[day],
                              lines: [
                                `${formatTime(band.start)} – ${formatTime(band.end)} · ${formatDuration(minutes)}`,
                                ...(solo
                                  ? awayNames.length > 0
                                    ? ["No class — you'd come to campus specially"]
                                    : outsideNames.length > 0
                                      ? ["Before your first class, or after your last"]
                                      : []
                                  : [
                                      // On a class band the title already
                                      // says what's happening, so the "nobody
                                      // is free" line is the same fact twice.
                                      ...(freeNames.length > 0
                                        ? [{ label: "Free", value: freeNames.join(", ") }]
                                        : inClass
                                          ? []
                                          : ["Nobody is on campus with a gap here"]),
                                      // Which class, not just who — but only
                                      // while it stays a line. Past three
                                      // people the card grows a paragraph and
                                      // the names are the useful half.
                                      ...(busyNames.length > 0
                                        ? [
                                            // The course only earns its place
                                            // when the title isn't already it.
                                            {
                                              label: "In class",
                                              value: busyCourseLine ?? busyNames.join(", "),
                                            },
                                          ]
                                        : []),
                                      // The two reasons someone isn't counted. Worth
                                      // spelling out — otherwise a 2/7 next to a full
                                      // detailed grid looks like a bug.
                                      ...(outsideNames.length > 0
                                        ? [{ label: "Off campus", value: outsideNames.join(", ") }]
                                        : []),
                                      ...(awayNames.length > 0
                                        ? [{ label: "No class", value: awayNames.join(", ") }]
                                        : []),
                                    ]),
                                // Only the split. One campus is the ordinary
                                // case and saying so is a line of noise on
                                // every card; two means they can't actually
                                // meet, which is the one thing worth the row.
                                ...(free > 0 && !band.sharedCampus
                                  ? [`Split across ${band.campuses.join(" and ")}`]
                                  : []),
                              ],
                              // Grey on a class band: the emerald square is the
                              // ramp's colour, and this band isn't on it.
                              accent: inClass ? "#a3a3a3" : `rgb(${FILL.join(",")})`,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseMove={(e) =>
                            setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                          }
                          onMouseLeave={() => setHover(null)}
                        >
                          {/* The count is the point of the view, so it goes in
                              first and stays as long as there's a line for it.
                              Names and times only earn their place on the taller
                              bands — the ten-minute slivers between a class
                              ending at :20 and the next starting at :30 can't
                              hold anything, and shouldn't pretend to. */}
                          {minutes >= 30 &&
                            (inClass ? (
                              /* The count on a class band is always 0/n, which
                                 says nothing you can't see from the shading.
                                 The course codes say what the band actually is,
                                 and in solo mode they replace a bare "Class". */
                              <span className="w-full truncate text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                                {courses && courses.all.length > 0
                                  ? nameList(courses.all, 2)
                                  : solo ? "Class" : `0/${total}`}
                              </span>
                            ) : (
                              <span className="font-semibold text-[11px] text-emerald-950 tabular-nums dark:text-white">
                                {solo ? (free > 0 ? "Gap" : "") : `${free}/${total}`}
                              </span>
                            ))}
                          {showNames && (
                            <span className="w-full truncate text-[10px] font-medium text-emerald-950/85 dark:text-white/85">
                              {missingNames
                                ? `all but ${missingNames.join(", ")}`
                                : nameList(freeNames)}
                            </span>
                          )}
                          {minutes >= (showNames ? 80 : 55) && (
                            <span
                              className={`text-[10px] tabular-nums ${
                                inClass
                                  ? "text-neutral-500 dark:text-neutral-400"
                                  : "text-emerald-950/70 dark:text-white/70"
                              }`}
                            >
                              {formatTime(band.start)}–{formatTime(band.end)}
                            </span>
                          )}
                        </div>
                      );
                    })}

                  {now?.day === day && <NowLine top={pct(now.minutes)} minutes={now.minutes} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && <HoverCard card={hover} />}
    </div>
  );
}
