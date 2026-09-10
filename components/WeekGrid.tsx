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

/**
 * A gap between classes is the window worth meeting in — everyone is already on
 * campus and has to stay for a later class. Free time before the first class or
 * after the last one is real, but it competes with going home, so it's dimmed
 * rather than coloured. Within the gaps, campus still decides green vs amber.
 */
function freeStyle(w: FreeWindow, solo: boolean) {
  if (!w.betweenClasses) {
    return {
      box: "bg-neutral-400/10 ring-1 ring-inset ring-neutral-400/30 dark:bg-neutral-400/10",
      strong: "text-neutral-600 dark:text-neutral-300",
      soft: "text-neutral-500 dark:text-neutral-400",
      accent: "#a3a3a3",
      tag: "FREE",
    };
  }
  return w.sharedCampus
    ? {
        box: "bg-emerald-400/30 ring-2 ring-inset ring-emerald-500/60",
        strong: "text-emerald-800 dark:text-emerald-200",
        soft: "text-emerald-800/80 dark:text-emerald-200/80",
        accent: "#10b981",
        // "ALL FREE" is about the group; with one schedule on screen there
        // is no group, just a gap in your own day.
        tag: solo ? "GAP" : "GAP · ALL FREE",
      }
    : {
        box: "bg-amber-300/25 ring-2 ring-inset ring-amber-500/50",
        strong: "text-amber-800 dark:text-amber-200",
        soft: "text-amber-800/80 dark:text-amber-200/80",
        accent: "#f59e0b",
        tag: solo ? "GAP" : "GAP · SPLIT",
      };
}

/** "Ann, Bo, Cy" — and "+2" past three, so the block stays one line. */
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

interface Entry {
  /** Everyone sitting in this exact section at this exact hour. */
  members: Member[];
  block: BusyBlock;
}

interface Placed extends Entry {
  /** Column inside its overlap cluster, and how many columns that cluster has. */
  column: number;
  columns: number;
  /** Columns it stretches across — empty neighbours to its right. */
  span: number;
}

/**
 * Lay one day out by what actually overlaps, not by who owns it. Classes that
 * clash split the width between them; a class with nothing beside it takes the
 * whole column, which is most of them — a fixed lane per member left every
 * block a sliver of the day wide for no reason.
 *
 * Blocks are grouped into clusters of transitively overlapping classes, and
 * columns are assigned greedily inside each cluster, so a busy hour never
 * narrows the rest of the day.
 */
/**
 * One block per section, not per person. Two people in CMPT 479 D100 are in
 * the same room at the same hour — drawing that twice both wastes the width
 * and hides the fact that they're already together. Custom busy time never
 * merges: it has no class number, and two people's "Busy" is not one event.
 */
function mergeSameSection(entries: { member: Member; block: BusyBlock }[]): Entry[] {
  const merged: Entry[] = [];
  const byKey = new Map<string, Entry>();

  for (const { member, block } of entries) {
    if (block.classNumber === undefined) {
      merged.push({ members: [member], block });
      continue;
    }
    const key = `${block.classNumber}|${block.start}|${block.end}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(member);
    } else {
      const entry: Entry = { members: [member], block };
      byKey.set(key, entry);
      merged.push(entry);
    }
  }
  return merged;
}

function packDay(entries: Entry[]): Placed[] {
  const sorted = [...entries].sort(
    (a, b) => a.block.start - b.block.start || a.block.end - b.block.end
  );

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  let lanes: number[] = []; // end time of the last block in each column

  function closeCluster() {
    for (const p of cluster) {
      p.columns = lanes.length;
      // Grow right while the next column has nothing running at this hour, so
      // a class alone at 2pm isn't a sliver just because 10am was busy.
      while (
        p.column + p.span < lanes.length &&
        !cluster.some(
          (q) =>
            q !== p &&
            q.column === p.column + p.span &&
            q.block.start < p.block.end &&
            q.block.end > p.block.start
        )
      ) {
        p.span++;
      }
    }
    placed.push(...cluster);
    cluster = [];
    lanes = [];
    clusterEnd = -Infinity;
  }

  for (const entry of sorted) {
    // Nothing in the cluster is still running, so this starts a fresh one.
    if (entry.block.start >= clusterEnd && cluster.length > 0) closeCluster();

    let column = lanes.findIndex((end) => end <= entry.block.start);
    if (column === -1) {
      column = lanes.length;
      lanes.push(entry.block.end);
    } else {
      lanes[column] = entry.block.end;
    }

    cluster.push({ members: entry.members, block: entry.block, column, columns: 1, span: 1 });
    clusterEnd = Math.max(clusterEnd, entry.block.end);
  }
  if (cluster.length > 0) closeCluster();

  return placed;
}

interface Props {
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  dayStart: number;
  dayEnd: number;
  /** One person's week: labels drop the group framing. */
  solo?: boolean;
  /** A section being considered, drawn over the week but not part of it. */
  preview?: BusyBlock[];
  /** Whose it would be — the preview borrows their colour. */
  previewColor?: string;
}

export function WeekGrid({
  members,
  busyByMember,
  free,
  dayStart,
  dayEnd,
  solo = false,
  preview = [],
  previewColor = "#737373",
}: Props) {
  // Tracked in state rather than a CSS-only tooltip: the day columns clip their
  // overflow, so an in-flow tooltip would be cut off at the column edge. A
  // fixed-position card follows the cursor and escapes the clipping entirely.
  const [hover, setHover] = useState<HoverCard | null>(null);

  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;
  const heightPct = (mins: number) => (mins / span) * 100;

  const withSchedules = members.filter((m) => (busyByMember[m.id] ?? []).length > 0);

  // One packed layout per day, reused by the render below.
  const placedByDay = new Map<DayKey, Placed[]>();
  for (const day of WEEKDAYS) {
    const entries = withSchedules.flatMap((member) =>
      (busyByMember[member.id] ?? [])
        .filter((b) => b.day === day)
        .map((block) => ({ member, block }))
    );
    // Merging happens after the member filter, so unticking someone in
    // "Who's in" splits a shared block back apart on the same render.
    placedByDay.set(day, packDay(mergeSameSection(entries)));
  }

  // The widest clash in the week decides how much room a column needs; most
  // days are far narrower than the member count would have suggested.
  const maxColumns = Math.max(
    1,
    ...[...placedByDay.values()].map((ps) => Math.max(1, ...ps.map((p) => p.columns)))
  );

  // A column narrower than ~46px truncates "CMPT 307" mid-word, so the grid
  // grows with the worst clash and scrolls sideways rather than shrinking
  // past the point of being readable.
  const minGridWidth = 56 + 5 * Math.max(124, maxColumns * 62);

  // Past three columns a course code no longer fits at the roomier size, so the
  // type and padding tighten rather than letting "CMPT 307" clip mid-word.
  const tight = maxColumns >= 4;

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

                  {/* Free windows sit behind the busy bands. Gaps between
                      classes are the ones worth spotting, so they carry the
                      colour; the rest stay grey. */}
                  {dayFree.map((w, i) => {
                    const minutes = w.end - w.start;
                    const tone = freeStyle(w, solo);
                    return (
                      <div
                        key={`free-${i}`}
                        className={`absolute inset-x-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center ${tone.box}`}
                        style={{
                          top: `${pct(w.start)}%`,
                          height: `${heightPct(minutes)}%`,
                        }}
                        onMouseEnter={(e) =>
                          setHover({
                            title: w.betweenClasses ? "Gap between classes" : solo ? "Your free time" : "Everyone free",
                            subtitle: LABELS[day],
                            lines: [
                              `${formatTime(w.start)} – ${formatTime(w.end)} · ${formatDuration(minutes)}`,
                              w.onCampus.length === 0
                                ? solo ? "You have no classes this day" : "Nobody has class this day — someone has to travel"
                                : `On campus: ${w.onCampus.join(", ")}`,
                              w.campuses.length === 0
                                ? "No campus anchor — meet anywhere"
                                : w.sharedCampus
                                  ? `${solo ? "You're" : "Everyone"} near ${w.campuses[0]}`
                                  : `Split across ${w.campuses.join(" and ")}`,
                            ],
                            accent: tone.accent,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                        }
                        onMouseLeave={() => setHover(null)}
                      >
                        {minutes >= 60 && (
                          <>
                            <span className={`text-[10px] font-semibold tracking-wide ${tone.strong}`}>
                              {tone.tag}
                            </span>
                            <span className={`text-[10px] tabular-nums ${tone.soft}`}>
                              {formatTime(w.start)}–{formatTime(w.end)}
                            </span>
                            {/* Who's already on campus matters more than where,
                                so names take the next line and the campus only
                                shows when the block is tall enough for both. */}
                            {minutes >= 90 && w.onCampus.length > 0 && (
                              <span className={`w-full truncate text-[10px] font-medium ${tone.strong}`}>
                                {nameList(w.onCampus)}
                              </span>
                            )}
                            {minutes >= 130 && w.campuses.length > 0 && (
                              <span className={`text-[10px] ${tone.soft}`}>
                                {w.campuses.join(" / ")}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Blocks share width only with what they overlap. */}
                  {(placedByDay.get(day) ?? []).map(({ members: who, block: b, column, columns, span }, bi) => {
                    const minutes = b.end - b.start;
                    const unit = 100 / columns;
                    const width = unit * span;
                    const shared = who.length > 1;
                    return (
                      <div
                        key={`${who[0].id}-${bi}`}
                        className={`absolute flex flex-col overflow-hidden rounded-md leading-tight text-white ${
                          tight ? "px-1 py-0.5" : "px-1.5 py-1"
                        } ${shared ? "bg-neutral-700 pl-2.5 dark:bg-neutral-600" : ""}`}
                        style={{
                          top: `calc(${pct(b.start)}% + ${GAP_Y / 2}px)`,
                          height: `calc(${heightPct(minutes)}% - ${GAP_Y}px)`,
                          left: `calc(${column * unit}% + ${GAP_X / 2}px)`,
                          width: `calc(${width}% - ${GAP_X}px)`,
                          backgroundColor: shared ? undefined : who[0].color,
                        }}
                        onMouseEnter={(e) =>
                          setHover({
                            title: b.course,
                            subtitle: b.detail || undefined,
                            lines: [
                              who.map((m) => m.displayName).join(", "),
                              `${formatTime(b.start)} – ${formatTime(b.end)} · ${formatDuration(minutes)}`,
                              b.campus ?? "No campus listed",
                              ...(shared ? ["Same section — you're already together"] : []),
                            ],
                            accent: who[0].color,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                        }
                        onMouseLeave={() => setHover(null)}
                      >
                        {/* A shared block has no single owner, so the colours
                            move to a stripe down the edge and the fill goes
                            neutral — you can still scan the column for a person. */}
                        {shared && (
                          <span className="absolute inset-y-0 left-0 flex w-1.5 flex-col overflow-hidden rounded-l-md">
                            {who.map((m) => (
                              <span key={m.id} className="flex-1" style={{ backgroundColor: m.color }} />
                            ))}
                          </span>
                        )}
                        <span className={`truncate font-semibold ${tight ? "text-[10px]" : "text-[11px]"}`}>
                          {b.course}
                        </span>
                        {/* Whose block it is matters more than the section
                            code, so the names get the second line and the
                            section only appears when there's room for it. */}
                        {minutes >= 50 && (
                          <span className={`truncate font-medium text-white/95 ${tight ? "text-[9px]" : "text-[10px]"}`}>
                            {nameList(who.map((m) => m.displayName), shared ? 2 : 1)}
                          </span>
                        )}
                        {minutes >= 80 && b.detail && (
                          <span className={`truncate text-white/80 ${tight ? "text-[9px]" : "text-[10px]"}`}>
                            {b.detail}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Drawn over the week at full width and never packed with
                      it: this section isn't yours yet, and squeezing the real
                      blocks aside for something you might not add would make
                      the grid jump under the cursor. */}
                  {preview
                    .filter((b) => b.day === day)
                    .map((b, pi) => {
                      const minutes = b.end - b.start;
                      return (
                        <div
                          key={`preview-${pi}`}
                          className="pointer-events-none absolute z-10 flex flex-col justify-center overflow-hidden rounded-md border-2 border-dashed px-1.5 py-1 leading-tight backdrop-blur-[1px]"
                          style={{
                            top: `calc(${pct(b.start)}% + ${GAP_Y / 2}px)`,
                            height: `calc(${heightPct(minutes)}% - ${GAP_Y}px)`,
                            left: GAP_X / 2,
                            right: GAP_X / 2,
                            borderColor: previewColor,
                            backgroundColor: `${previewColor}59`,
                          }}
                        >
                          <span className="truncate text-[10px] font-semibold text-white">
                            {b.course}
                          </span>
                          {minutes >= 50 && (
                            <span className="truncate text-[9px] font-medium text-white/90">
                              {b.detail}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
