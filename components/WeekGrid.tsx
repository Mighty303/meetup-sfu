"use client";

import { useState } from "react";
import type { BusyBlock, FreeWindow } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

// Blocks are placed by percentage, so back-to-back classes would share an edge
// and read as one long block. Insetting by a fixed pixel amount keeps the gap
// constant at every column height, instead of scaling with the class length.
const GAP_Y = 2;
const GAP_X = 3;

const COLUMN_HEIGHT = "h-[520px] sm:h-[660px] lg:h-[780px] xl:h-[880px]";

/** 80 -> "1h 20m", 50 -> "50m" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface HoverCard {
  title: string;
  subtitle?: string;
  lines: string[];
  accent: string;
  x: number;
  y: number;
}

export interface Member {
  id: number;
  displayName: string;
  color: string;
}

interface Props {
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  dayStart: number;
  dayEnd: number;
}

export function WeekGrid({ members, busyByMember, free, dayStart, dayEnd }: Props) {
  // Tracked in state rather than a CSS-only tooltip: the day columns clip their
  // overflow, so an in-flow tooltip would be cut off at the column edge. A
  // fixed-position card follows the cursor and escapes the clipping entirely.
  const [hover, setHover] = useState<HoverCard | null>(null);

  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;
  const heightPct = (mins: number) => (mins / span) * 100;

  // Members with no schedule would otherwise reserve an empty lane and squeeze
  // everyone else's blocks; lanes go only to people who actually have classes.
  const laneMembers = members.filter((m) => (busyByMember[m.id] ?? []).length > 0);
  const lane = 100 / Math.max(laneMembers.length, 1);

  // A lane narrower than ~46px truncates "CMPT 307" mid-word, so the grid grows
  // with the number of people and scrolls sideways rather than shrinking lanes
  // past the point of being readable.
  const minGridWidth = 56 + 5 * Math.max(124, laneMembers.length * 52);

  // Past three lanes a course code no longer fits at the roomier size, so the
  // type and padding tighten rather than letting "CMPT 307" clip mid-word.
  const tight = laneMembers.length >= 4;

  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);

  return (
    // On narrow screens the week scrolls sideways instead of turning into slivers.
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 text-xs" style={{ minWidth: minGridWidth }}>
        {/* Hour gutter. The empty header mirrors the day-name row so the hour
            labels line up with the grid lines instead of sitting a row high. */}
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
          {WEEKDAYS.map((day) => {
            const dayFree = free.filter((w) => w.day === day);
            return (
              <div key={day}>
                <div className="mb-1 text-center font-medium text-neutral-600 dark:text-neutral-300">
                  {LABELS[day]}
                </div>
                <div
                  className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${COLUMN_HEIGHT}`}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
                      style={{ top: `${pct(h)}%` }}
                    />
                  ))}

                  {/* Everyone-free windows sit behind the busy bands. A window
                      where everyone is anchored to one campus is the thing
                      worth spotting, so it gets the strongest treatment. */}
                  {dayFree.map((w, i) => {
                    const minutes = w.end - w.start;
                    return (
                      <div
                        key={`free-${i}`}
                        className={`absolute inset-x-0 flex flex-col items-center justify-center gap-0.5 text-center ${
                          w.sharedCampus
                            ? "bg-emerald-400/30 ring-2 ring-inset ring-emerald-500/60"
                            : "bg-amber-300/20 ring-1 ring-inset ring-amber-500/40"
                        }`}
                        style={{
                          top: `${pct(w.start)}%`,
                          height: `${heightPct(minutes)}%`,
                        }}
                        onMouseEnter={(e) =>
                          setHover({
                            title: "Everyone free",
                            subtitle: LABELS[day],
                            lines: [
                              `${formatTime(w.start)} – ${formatTime(w.end)} · ${formatDuration(minutes)}`,
                              w.campuses.length === 0
                                ? "No campus anchor — meet anywhere"
                                : w.sharedCampus
                                  ? `Everyone near ${w.campuses[0]}`
                                  : `Split across ${w.campuses.join(" and ")}`,
                            ],
                            accent: w.sharedCampus ? "#10b981" : "#f59e0b",
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                        }
                        onMouseLeave={() => setHover(null)}
                      >
                        {minutes >= 75 && (
                          <>
                            <span
                              className={`text-[10px] font-semibold tracking-wide ${
                                w.sharedCampus
                                  ? "text-emerald-800 dark:text-emerald-200"
                                  : "text-amber-800 dark:text-amber-200"
                              }`}
                            >
                              {w.sharedCampus ? "ALL FREE" : "ALL FREE · SPLIT"}
                            </span>
                            <span
                              className={`text-[10px] tabular-nums ${
                                w.sharedCampus
                                  ? "text-emerald-800/80 dark:text-emerald-200/80"
                                  : "text-amber-800/80 dark:text-amber-200/80"
                              }`}
                            >
                              {formatTime(w.start)}–{formatTime(w.end)}
                            </span>
                            {minutes >= 120 && w.campuses.length > 0 && (
                              <span
                                className={`text-[10px] ${
                                  w.sharedCampus
                                    ? "text-emerald-800/70 dark:text-emerald-200/70"
                                    : "text-amber-800/70 dark:text-amber-200/70"
                                }`}
                              >
                                {w.campuses.join(" / ")}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* one vertical lane per member who has classes */}
                  {laneMembers.map((member, mi) =>
                    (busyByMember[member.id] ?? [])
                      .filter((b) => b.day === day)
                      .map((b, bi) => {
                        const minutes = b.end - b.start;
                        return (
                          <div
                            key={`${member.id}-${bi}`}
                            className={`absolute flex flex-col overflow-hidden rounded-md leading-tight text-white ${
                              tight ? "px-1 py-0.5" : "px-1.5 py-1"
                            }`}
                            style={{
                              top: `calc(${pct(b.start)}% + ${GAP_Y / 2}px)`,
                              height: `calc(${heightPct(minutes)}% - ${GAP_Y}px)`,
                              left: `calc(${mi * lane}% + ${GAP_X / 2}px)`,
                              width: `calc(${lane}% - ${GAP_X}px)`,
                              backgroundColor: member.color,
                            }}
                            onMouseEnter={(e) =>
                              setHover({
                                title: b.course,
                                subtitle: b.detail || undefined,
                                lines: [
                                  member.displayName,
                                  `${formatTime(b.start)} – ${formatTime(b.end)} · ${formatDuration(minutes)}`,
                                  b.campus ?? "No campus listed",
                                ],
                                accent: member.color,
                                x: e.clientX,
                                y: e.clientY,
                              })
                            }
                            onMouseMove={(e) =>
                              setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                            }
                            onMouseLeave={() => setHover(null)}
                          >
                            <span className={`truncate font-semibold ${tight ? "text-[10px]" : "text-[11px]"}`}>
                              {b.course}
                            </span>
                            {/* Whose block it is matters more than the section
                                code, so the name gets the second line and the
                                section only appears when there's room for it. */}
                            {minutes >= 50 && (
                              <span className={`truncate font-medium text-white/95 ${tight ? "text-[9px]" : "text-[10px]"}`}>
                                {member.displayName}
                              </span>
                            )}
                            {minutes >= 80 && b.detail && (
                              <span className={`truncate text-white/80 ${tight ? "text-[9px]" : "text-[10px]"}`}>
                                {b.detail}
                              </span>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hover && (
        <div
          // Fixed so it escapes the columns' overflow clipping. Offset from the
          // cursor, and flipped left near the right edge so it stays on screen.
          className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95"
          style={{
            left: Math.min(hover.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 260),
            top: hover.y + 14,
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: hover.accent }} />
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {hover.title}
            </span>
            {hover.subtitle && (
              <span className="text-xs text-neutral-500">{hover.subtitle}</span>
            )}
          </div>
          {hover.lines.map((line, i) => (
            <div key={i} className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
