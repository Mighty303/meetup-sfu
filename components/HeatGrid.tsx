"use client";

import { useMemo, useState } from "react";
import { HoverCard, type HoverCardData } from "@/components/HoverCard";
import { COLUMN_HEIGHT } from "@/lib/grid-layout";
import { availabilityGrid, type BusyBlock } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";
import type { Member } from "@/components/WeekGrid";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

// SFU sections run :30–:20, so half-hour rows land on class boundaries. An
// hour row would let a 9:30–10:20 class blot out 9:00–11:00.
const SLOT_MINUTES = 30;

// Emerald, matching the "everyone free" green the detailed grid already uses.
const FILL = [16, 185, 129] as const;

/**
 * Alpha for `n of total` free. Zero is left transparent so the column's own
 * background shows through — an empty slot should read as the paper, not as a
 * very pale green. The floor at 0.12 keeps one person out of eight visible.
 */
function fillAlpha(free: number, total: number): number {
  if (free === 0 || total === 0) return 0;
  return 0.12 + 0.73 * (free / total);
}

/** "Ann, Bo, Cy" — and "+2" past four, so the card stays narrow. */
function nameList(names: string[], max = 4): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
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
 * shade every half-hour by how many people are free in it. The detailed grid
 * answers "what is Ann's Tuesday"; this one answers "when can we meet", which
 * `commonFree` can only answer when *literally everyone* is free.
 */
export function HeatGrid({ members, busyByMember, dayStart, dayEnd, solo = false }: Props) {
  const [hover, setHover] = useState<HoverCardData | null>(null);

  // Only people with a schedule constrain anything; someone with nothing saved
  // would read as free all week and wash the whole grid green.
  const withSchedules = useMemo(
    () => members.filter((m) => (busyByMember[m.id] ?? []).length > 0),
    [members, busyByMember]
  );

  const rows = useMemo(
    () =>
      availabilityGrid({
        members: withSchedules.map((m) => ({
          name: m.displayName,
          busy: busyByMember[m.id] ?? [],
        })),
        dayStart,
        dayEnd,
        slotMinutes: SLOT_MINUTES,
      }),
    [withSchedules, busyByMember, dayStart, dayEnd]
  );

  const total = withSchedules.length;
  const rowHeight = rows.length > 0 ? 100 / rows.length : 100;
  // One swatch per person up to six, then a sampled ramp — a twelve-person
  // group doesn't need twelve legend chips to read as a gradient.
  const swatches = Math.min(total, 6) + 1;

  if (total === 0) {
    return (
      <p className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
        Nobody here has a saved schedule yet, so there&apos;s no availability to shade.
      </p>
    );
  }

  return (
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
            · hover a slot {solo ? "for the time" : "to see who"}
          </span>
          <span className="flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
            ·
            <span className="h-3.5 w-6 rounded-sm ring-2 ring-inset ring-emerald-700/70 dark:ring-emerald-200/60" />
            between classes
          </span>
        </div>

        <div className="flex gap-2 text-xs">
          {/* Hour gutter, same width as the detailed grid so the two views line
              up when you toggle between them. */}
          <div className="w-12 shrink-0">
            <div className="mb-1 text-center font-medium" aria-hidden>&nbsp;</div>
            <div className={`relative ${COLUMN_HEIGHT}`}>
              {rows.map((row, i) =>
                row[0].start % 60 === 0 ? (
                  <div
                    key={row[0].start}
                    className="absolute right-1 -translate-y-1/2 text-neutral-500 tabular-nums"
                    style={{ top: `${i * rowHeight}%` }}
                  >
                    {formatTime(row[0].start).replace(":00", "")}
                  </div>
                ) : null
              )}
            </div>
          </div>

          <div className="grid flex-1 grid-cols-5 gap-2">
            {WEEKDAYS.map((day, di) => (
              <div key={day}>
                <div className="mb-1 text-center font-medium text-neutral-600 dark:text-neutral-300">
                  {LABELS[day]}
                </div>
                <div
                  className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${COLUMN_HEIGHT}`}
                >
                  {rows.map((row, ri) => {
                    const slot = row[di];
                    const free = slot.freeIndices.length;
                    const freeNames = slot.freeIndices.map((i) => withSchedules[i].displayName);
                    const busyNames = slot.busyIndices.map((i) => withSchedules[i].displayName);
                    return (
                      <div
                        key={slot.start}
                        // A ring on the gap slots rather than a different hue:
                        // the ramp already carries the count, and repainting it
                        // would make "between classes" compete with "how many".
                        className={`absolute inset-x-0 ${
                          slot.start % 60 === 0
                            ? "border-t border-neutral-300/70 dark:border-neutral-700/70"
                            : "border-t border-neutral-200/40 dark:border-neutral-800/40"
                        } ${slot.betweenClasses ? "ring-1 ring-inset ring-emerald-700/70 dark:ring-emerald-200/60" : ""}`}
                        style={{
                          top: `${ri * rowHeight}%`,
                          height: `${rowHeight}%`,
                          backgroundColor: `rgba(${FILL.join(",")},${fillAlpha(free, total)})`,
                        }}
                        onMouseEnter={(e) =>
                          setHover({
                            title: solo
                              ? free > 0 ? "You're free" : "You have class"
                              : `${free} of ${total} free`,
                            subtitle: LABELS[day],
                            lines: [
                              `${formatTime(slot.start)} – ${formatTime(slot.end)}`,
                              ...(solo
                                ? []
                                : [
                                    freeNames.length > 0 ? `Free: ${nameList(freeNames)}` : "Nobody is free",
                                    ...(busyNames.length > 0 ? [`Busy: ${nameList(busyNames)}`] : []),
                                  ]),
                              slot.betweenClasses
                                ? solo
                                  ? "Between your classes — you're on campus already"
                                  : "Between classes — nobody travels for this"
                                : slot.campuses.length === 0
                                  ? "No campus anchor — meet anywhere"
                                  : slot.sharedCampus
                                    ? `Near ${slot.campuses[0]}`
                                    : `Split across ${slot.campuses.join(" and ")}`,
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
                      />
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
