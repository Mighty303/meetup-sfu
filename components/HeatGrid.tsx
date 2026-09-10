"use client";

import { useMemo, useState } from "react";
import { HoverCard, type HoverCardData } from "@/components/HoverCard";
import type { Member } from "@/components/WeekGrid";
import { COLUMN_HEIGHT } from "@/lib/grid-layout";
import { availabilityBands, type BusyBlock } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

// Emerald, matching the "everyone free" green the detailed grid already uses.
const FILL = [16, 185, 129] as const;

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
export function HeatGrid({ members, busyByMember, dayStart, dayEnd, solo = false }: Props) {
  const [hover, setHover] = useState<HoverCardData | null>(null);

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
        Nobody here has a saved schedule yet, so there&apos;s no availability to shade.
      </p>
    );
  }

  return (
    // On narrow screens the week scrolls sideways instead of turning into slivers.
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-[620px] flex-col gap-2">
        {/* Legend. The ramp is sampled at the real group size, so the swatches
            are the exact shades on the grid rather than a generic gradient. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
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
          {/* Otherwise a blank Monday, and blank mornings, read as a bug
              rather than as the whole point of the view. */}
          <span className="w-full text-center text-neutral-400 dark:text-neutral-500">
            Only gaps between classes are shaded. Before the day&apos;s first class
            and after its last, campus is empty —{" "}
            {solo ? "you'd be going in specially" : "someone would be travelling in specially"}.
          </span>
        </div>

        <div className="flex gap-2 text-xs">
          {/* Hour gutter. The empty header mirrors the day-name row so the hour
              labels line up with the grid lines, and its width matches the
              detailed grid's so the two views don't shift when you toggle. */}
          <div className="w-12 shrink-0">
            <div className="mb-1 text-center font-medium" aria-hidden>&nbsp;</div>
            <div className={`relative ${COLUMN_HEIGHT}`}>
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

          <div className="grid flex-1 grid-cols-5 gap-2">
            {WEEKDAYS.map((day) => (
              <div key={day}>
                <div className="mb-1 text-center font-medium text-neutral-600 dark:text-neutral-300">
                  {LABELS[day]}
                </div>
                <div
                  className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${COLUMN_HEIGHT}`}
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
                      // Naming everyone under a "7/7" only repeats the count in
                      // longer form. Names earn their line when the band is
                      // split, which is when you actually need to know who.
                      const showNames = !solo && free > 0 && free < total && minutes >= 55;
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
                            backgroundColor: `rgba(${FILL.join(",")},${fillAlpha(free, total)})`,
                          }}
                          onMouseEnter={(e) =>
                            setHover({
                              title: solo
                                ? free > 0
                                  ? "Gap between your classes"
                                  : busyNames.length > 0
                                    ? "You have class"
                                    : awayNames.length > 0
                                      ? "No class today"
                                      : "Off campus"
                                : `${free} of ${total} on campus and free`,
                              subtitle: LABELS[day],
                              lines: [
                                `${formatTime(band.start)} – ${formatTime(band.end)} · ${formatDuration(minutes)}`,
                                ...(solo
                                  ? awayNames.length > 0
                                    ? ["No class this day — you'd come to campus specially"]
                                    : outsideNames.length > 0
                                      ? ["Before the first class of the day, or after the last"]
                                      : []
                                  : [
                                      freeNames.length > 0
                                        ? `Free: ${freeNames.join(", ")}`
                                        : "Nobody is on campus with a gap here",
                                      ...(busyNames.length > 0 ? [`In class: ${busyNames.join(", ")}`] : []),
                                      // The two reasons someone isn't counted. Worth
                                      // spelling out — otherwise a 2/7 next to a full
                                      // detailed grid looks like a bug.
                                      ...(outsideNames.length > 0
                                        ? ["Campus is empty at this hour — no classes either side"]
                                        : []),
                                      ...(awayNames.length > 0
                                        ? [`No class this day: ${awayNames.join(", ")}`]
                                        : []),
                                    ]),
                                ...(free > 0
                                  ? [
                                      band.campuses.length === 0
                                        ? "No campus anchor — meet anywhere"
                                        : band.sharedCampus
                                          ? `Near ${band.campuses[0]}`
                                          : `Split across ${band.campuses.join(" and ")}`,
                                    ]
                                  : []),
                              ],
                              accent: `rgb(${FILL.join(",")})`,
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
                          {minutes >= 30 && (
                            <span className="font-semibold text-[11px] text-emerald-950 tabular-nums dark:text-white">
                              {solo
                                ? free > 0
                                  ? "Gap"
                                  : busyNames.length > 0
                                    ? "Class"
                                    : ""
                                : `${free}/${total}`}
                            </span>
                          )}
                          {showNames && (
                            <span className="w-full truncate text-[10px] font-medium text-emerald-950/85 dark:text-white/85">
                              {nameList(freeNames)}
                            </span>
                          )}
                          {minutes >= (showNames ? 80 : 55) && (
                            <span className="text-[10px] text-emerald-950/70 tabular-nums dark:text-white/70">
                              {formatTime(band.start)}–{formatTime(band.end)}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
