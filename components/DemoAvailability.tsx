"use client";

import { useMemo, useState } from "react";
import { HeatGrid } from "@/components/HeatGrid";
import { WeekGrid } from "@/components/WeekGrid";
import { commonFree, type BusyBlock } from "@/lib/overlap";
import type { DayKey } from "@/lib/sfu";

/**
 * A worked example of the week for the home page, so the pitch above it is
 * something you can look at rather than take on faith. Both readings sit behind
 * the same toggle the group page uses: they answer different questions, and
 * showing only one undersells the thing.
 *
 * The data is invented — four people who don't exist, on courses nobody is
 * enrolled in. It's deliberately not a real group: the page renders before you
 * sign in, and a real week would mean either a fixture in the database or a
 * fetch the first paint has to wait on.
 */

// The group page opens at 8, but nothing here starts before 8:30, so that half
// hour was only ever a sliver of empty band above the first class.
const DAY_START = 8 * 60 + 30;
const DAY_END = 22 * 60;

// What the group page counts as worth crossing campus for. Matched so the gaps
// drawn here are the ones the real thing would draw.
const MIN_MINUTES = 60;

/**
 * Half a real week's height — this is a look at the thing, not the thing, and
 * full height would push everything under it off the screen.
 *
 * Both views get this same string, which is what keeps the page from jumping
 * when you toggle. COLUMN_HEIGHT does that job everywhere else and is left
 * alone deliberately: the real grids still want their full height.
 */
const DEMO_HEIGHT = "h-[420px] sm:h-[490px] lg:h-[540px]";

// Palette entries from MEMBER_COLORS, written out rather than imported: that
// module reaches for the database, which has no business in a static demo.
const PEOPLE = [
  { id: 1, displayName: "Ann", color: "#3b82f6" },
  { id: 2, displayName: "Bo", color: "#f97316" },
  { id: 3, displayName: "Cy", color: "#a855f7" },
  { id: 4, displayName: "Dee", color: "#22c55e" },
];

/** `["We", 13, 30, 15, 20]` — day, then start and end as hour/minute pairs. */
type Slot = [DayKey, number, number, number, number];

function block(course: string, detail: string, slot: Slot): BusyBlock {
  const [day, sh, sm, eh, em] = slot;
  return {
    day,
    start: sh * 60 + sm,
    end: eh * 60 + em,
    campus: "Burnaby",
    course,
    detail,
    label: `${course} ${detail}`,
    classNumber: `${course}-${detail}-${day}`,
  };
}

/**
 * Four plausible SFU weeks. They're arranged so the grid has something to say:
 * mornings are a write-off, Tuesday never clears, and Wednesday afternoon is
 * the one stretch all four have free — which is the answer the page exists to
 * give, sitting there in the darkest green.
 */
const SCHEDULES: Record<number, BusyBlock[]> = {
  1: [
    block("CMPT 225", "D100 LEC", ["Mo", 9, 30, 11, 20]),
    block("MACM 201", "D200 LEC", ["Mo", 13, 30, 14, 20]),
    block("CMPT 225", "D100 LEC", ["We", 9, 30, 11, 20]),
    block("MACM 201", "D200 TUT", ["We", 16, 30, 17, 20]),
    block("CMPT 276", "D100 LEC", ["Tu", 12, 30, 14, 20]),
    block("CMPT 276", "D100 LAB", ["Th", 14, 30, 16, 20]),
    block("MACM 201", "D200 LEC", ["Fr", 13, 30, 14, 20]),
  ],
  2: [
    block("CMPT 225", "D100 LEC", ["Mo", 9, 30, 11, 20]),
    block("STAT 270", "D100 LEC", ["Mo", 15, 30, 16, 20]),
    block("CMPT 225", "D100 LEC", ["We", 9, 30, 11, 20]),
    block("STAT 270", "D100 LEC", ["We", 15, 30, 16, 20]),
    block("BUS 272", "D100 LEC", ["Tu", 10, 30, 12, 20]),
    block("BUS 272", "D100 TUT", ["Th", 10, 30, 11, 20]),
    block("STAT 270", "D100 LEC", ["Fr", 15, 30, 16, 20]),
  ],
  3: [
    block("CMPT 295", "D100 LEC", ["Mo", 8, 30, 10, 20]),
    block("PHIL 105", "D100 LEC", ["Mo", 14, 30, 16, 20]),
    block("CMPT 295", "D100 LEC", ["We", 8, 30, 10, 20]),
    block("CMPT 295", "D100 LAB", ["We", 16, 30, 18, 20]),
    block("PHIL 105", "D100 TUT", ["Tu", 13, 30, 14, 20]),
    block("MATH 232", "D100 LEC", ["Tu", 15, 30, 17, 20]),
    block("MATH 232", "D100 LEC", ["Th", 15, 30, 17, 20]),
  ],
  4: [
    block("CMPT 213", "D100 LEC", ["Mo", 10, 30, 12, 20]),
    block("IAT 202", "D100 LEC", ["Mo", 16, 30, 18, 20]),
    block("CMPT 213", "D100 LEC", ["We", 10, 30, 12, 20]),
    block("CMPT 213", "D100 LAB", ["We", 17, 30, 19, 20]),
    block("IAT 202", "D100 TUT", ["Tu", 11, 30, 12, 20]),
    block("ENGL 199", "D100 LEC", ["Tu", 16, 30, 18, 20]),
    block("ENGL 199", "D100 LEC", ["Th", 16, 30, 18, 20]),
  ],
};

export function DemoAvailability() {
  // Local state, not a URL param: this is a landing-page demo and has no
  // business putting a query string on "/" or pulling in useSearchParams.
  const [grid, setGrid] = useState<"heat" | "detailed">("heat");

  // Stable across renders, so the grids' own memos never recompute.
  const busyByMember = useMemo(() => SCHEDULES, []);

  // Derived from the same blocks the grids draw, with the same helper the group
  // page uses. A hand-written window list would drift from the schedules above
  // the first time anyone edited one.
  const free = useMemo(
    () =>
      commonFree({
        members: PEOPLE.map((p) => ({ name: p.displayName, busy: SCHEDULES[p.id] })),
        dayStart: DAY_START,
        dayEnd: DAY_END,
        minMinutes: MIN_MINUTES,
      }),
    []
  );

  return (
    <div className="flex flex-col gap-6">
      {/* The group page's control, not a second one that merely resembles it. */}
      <div className="mx-auto flex overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
        {(["heat", "detailed"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setGrid(mode)}
            aria-pressed={grid === mode}
            className={`px-3 py-1.5 transition-colors ${
              grid === mode
                ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {mode === "detailed" ? "Detailed" : "Availability"}
          </button>
        ))}
      </div>

      {/* No weekStart on either: the "now" line belongs to a real week, and a
          demo that draws today's time on an invented one is just confusing. */}
      {grid === "heat" ? (
        <HeatGrid
          members={PEOPLE}
          busyByMember={busyByMember}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          columnHeight={DEMO_HEIGHT}
        />
      ) : (
        <WeekGrid
          members={PEOPLE}
          busyByMember={busyByMember}
          free={free}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          columnHeight={DEMO_HEIGHT}
        />
      )}
    </div>
  );
}
