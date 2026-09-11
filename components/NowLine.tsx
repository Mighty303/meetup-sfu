"use client";

import { useEffect, useRef, useState } from "react";
import { WEEKDAYS, formatTime, type DayKey } from "@/lib/sfu";

/** Midday, so the date can't slide across a daylight-saving boundary. */
function parseISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface NowMarker {
  day: DayKey;
  /** Minutes since midnight. */
  minutes: number;
}

function marker(weekStart: string, dayStart: number, dayEnd: number): NowMarker | null {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  // Outside the hours the grid draws, there's no row to point at.
  if (minutes < dayStart || minutes > dayEnd) return null;

  // Counted in days from the displayed Monday rather than read off getDay(),
  // so paging to another week hides the line instead of drawing it on the
  // same weekday of a week that isn't this one.
  const offset = Math.round(
    (parseISODate(toISODate(now)).getTime() - parseISODate(weekStart).getTime()) / 86_400_000
  );
  if (offset < 0 || offset >= WEEKDAYS.length) return null;
  return { day: WEEKDAYS[offset], minutes };
}

/**
 * Where "now" falls on the grid, or null when it falls nowhere on it — a week
 * that isn't this one, a weekend, or an hour outside the drawn day.
 *
 * Starts null and fills in after mount on purpose. The grids render on the
 * server too, and a clock read during that render disagrees with the one the
 * browser makes a moment later, which is a hydration mismatch.
 */
export function useNowMarker(
  weekStart: string | undefined,
  dayStart: number,
  dayEnd: number
): NowMarker | null {
  // Tagged with the week it was computed for. Effects run after the commit, so
  // paging to another week would otherwise draw the old line for a frame before
  // the recompute lands — and it lets the "no week yet" case fall out of the
  // read below instead of needing the effect to clear it.
  const [now, setNow] = useState<(NowMarker & { weekStart: string }) | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    const tick = () => {
      const m = marker(weekStart, dayStart, dayEnd);
      setNow(m && { ...m, weekStart });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [weekStart, dayStart, dayEnd]);

  return now && now.weekStart === weekStart ? now : null;
}

/** Which of the five drawn days is today, or null if the week isn't this one. */
function todayIndexIn(weekStart: string): number | null {
  const offset = Math.round(
    (parseISODate(toISODate(new Date())).getTime() - parseISODate(weekStart).getTime()) / 86_400_000
  );
  return offset >= 0 && offset < WEEKDAYS.length ? offset : null;
}

/**
 * Today's place in the week, for the two things that need it outside the "now"
 * line itself: marking the day header, and opening the mobile day track on
 * today rather than on Monday.
 *
 * Unlike `useNowMarker` this doesn't care what time it is — a day is still
 * today at 2am, when there's no row on the grid to point at.
 *
 * Returns the track ref to hang on whichever element scrolls. On desktop the
 * five days are laid out side by side with nothing to scroll, and the effect
 * notices that and leaves it alone.
 */
export function useTodayColumn(weekStart: string | undefined) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Null until after mount, like the "now" line and for the same reason: the
  // grids render on the server, where "today" is a different machine's clock.
  const [todayIndex, setTodayIndex] = useState<number | null>(null);

  useEffect(() => {
    const resolve = () => setTodayIndex(weekStart ? todayIndexIn(weekStart) : null);
    resolve();
    // A tab left open overnight should move the marker, not keep yesterday's.
    const id = setInterval(resolve, 60_000);
    return () => clearInterval(id);
  }, [weekStart]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Nothing overflows, so there is nothing to scroll and no day to choose.
    if (track.scrollWidth <= track.clientWidth) return;

    // Monday when the week on screen isn't this one — paging away should land
    // at the start of that week rather than keeping the offset you had.
    const cells = track.children;
    const target = cells[todayIndex ?? 0] as HTMLElement | undefined;
    const first = cells[0] as HTMLElement | undefined;
    if (!target || !first) return;
    // Measured against the first cell rather than read off offsetLeft alone,
    // which is relative to whichever ancestor happens to be positioned.
    track.scrollLeft = target.offsetLeft - first.offsetLeft;
  }, [todayIndex, weekStart]);

  return { trackRef, todayIndex };
}

/**
 * The current time, across today's column. Sits above everything the column
 * draws — a class block, a heat band — because it's the one thing you want to
 * find without looking for it.
 */
export function NowLine({ top, minutes }: { top: number; minutes: number }) {
  return (
    <div
      // Pulled up by half its own height so the rule sits *on* the minute
      // rather than a few pixels under it, same as the hour labels.
      className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
      style={{ top: `${top}%` }}
      title={`Now · ${formatTime(minutes)}`}
    >
      {/* The dot anchors the line to a point, so a line landing inside a dark
          block still reads as a time rather than as the block's own edge. */}
      <span className="ml-px h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-red-500/25" />
      {/* Thick enough to hold its own over a saturated class block — a hairline
          disappeared into the blocks it crossed. */}
      <span className="h-[3px] flex-1 rounded-full bg-red-500" />
    </div>
  );
}
