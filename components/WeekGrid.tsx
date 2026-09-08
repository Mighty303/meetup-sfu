"use client";

import type { BusyBlock, FreeWindow } from "@/lib/overlap";
import { formatTime, type DayKey } from "@/lib/sfu";

const WEEKDAYS: DayKey[] = ["Mo", "Tu", "We", "Th", "Fr"];
const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

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
  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;

  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);

  return (
    <div className="flex gap-2 text-xs">
      {/* hour gutter */}
      <div className="relative w-12 shrink-0" style={{ height: 640 }}>
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

      <div className="grid flex-1 grid-cols-5 gap-2">
        {WEEKDAYS.map((day) => {
          const dayFree = free.filter((w) => w.day === day);
          return (
            <div key={day}>
              <div className="mb-1 text-center font-medium text-neutral-600 dark:text-neutral-300">
                {LABELS[day]}
              </div>
              <div
                className="relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
                style={{ height: 640 }}
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
                        className="absolute overflow-hidden rounded-sm px-1 text-[9px] leading-tight text-white/95"
                        style={{
                          top: `${pct(b.start)}%`,
                          height: `${((b.end - b.start) / span) * 100}%`,
                          left: `${mi * lane}%`,
                          width: `${lane}%`,
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
  );
}
