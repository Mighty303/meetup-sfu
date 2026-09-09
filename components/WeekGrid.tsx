"use client";

import type { BusyBlock, FreeWindow } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";
const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

export interface Member {
  id: number;
  displayName: string;
  color: string;
}

// Grows with the viewport so a 14-hour day isn't crushed on a large screen,
// while staying short enough to see the whole week without scrolling on a phone.
const COLUMN_HEIGHT = "h-[460px] sm:h-[600px] lg:h-[720px] xl:h-[820px]";

// Blocks are placed by percentage, so back-to-back classes would share an edge
// and read as one long block. Insetting by a fixed pixel amount keeps the gap
// constant at every column height, instead of scaling with the class length.
const GAP_Y = 2;
const GAP_X = 3;

interface Props {
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  dayStart: number;
  dayEnd: number;
}

export function WeekGrid({ members, busyByMember, free, dayStart, dayEnd }: Props) {
  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;

  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);

  return (
    // Five columns can't compress below ~600px and stay readable, so on narrow
    // screens the week scrolls sideways instead of turning into slivers.
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-[620px] gap-2 text-xs">
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

                {/* everyone-free windows sit behind the busy bands */}
                {dayFree.map((w, i) => (
                  <div
                    key={`free-${i}`}
                    className={`absolute inset-x-0 ${
                      w.sharedCampus
                        ? "bg-emerald-400/25 ring-1 ring-inset ring-emerald-500/40"
                        : "bg-amber-300/20 ring-1 ring-inset ring-amber-500/40"
                    }`}
                    style={{ top: `${pct(w.start)}%`, height: `${((w.end - w.start) / span) * 100}%` }}
                    title={`${formatTime(w.start)}–${formatTime(w.end)}${
                      w.campuses.length ? ` · ${w.campuses.join(", ")}` : ""
                    }${w.sharedCampus ? "" : " · split across campuses"}`}
                  />
                ))}

                {/* one vertical lane per member */}
                {members.map((member, mi) => {
                  const lane = 100 / Math.max(members.length, 1);
                  return (busyByMember[member.id] ?? [])
                    .filter((b) => b.day === day)
                    .map((b, bi) => (
                      <div
                        key={`${member.id}-${bi}`}
                        className="absolute overflow-hidden rounded-md px-1 py-0.5 text-[9px] leading-tight text-white/95"
                        style={{
                          top: `calc(${pct(b.start)}% + ${GAP_Y / 2}px)`,
                          height: `calc(${((b.end - b.start) / span) * 100}% - ${GAP_Y}px)`,
                          left: `calc(${mi * lane}% + ${GAP_X / 2}px)`,
                          width: `calc(${lane}% - ${GAP_X}px)`,
                          backgroundColor: member.color,
                          opacity: 0.85,
                        }}
                        title={`${member.displayName} · ${b.label} · ${formatTime(b.start)}–${formatTime(b.end)}${
                          b.campus ? ` · ${b.campus}` : ""
                        }`}
                      >
                        {b.label}
                      </div>
                    ));
                })}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
