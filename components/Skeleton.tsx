/**
 * Loading placeholders shaped like the thing that's about to replace them, so
 * the page doesn't jump when the fetch lands. Colours and pulse match the
 * signed-out button placeholder in AuthButton.
 */

import { COLUMN_HEIGHT, LEGEND_HEIGHT } from "@/lib/grid-layout";

/** One grey bar. Sizing comes from the caller — this only carries the tone. */
export function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div style={style} className={`rounded bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

/** Avatar-sized dot, for the member chips and profile picture slots. */
export function Dot({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

const HOUR_LINES = Array.from({ length: 15 }, (_, i) => (i / 14) * 100);

// Rough class blocks per weekday: [top%, height%]. Hand-picked rather than
// random so the placeholder is stable across renders.
const BLOCKS: [number, number][][] = [
  [[8, 14], [38, 10]],
  [[20, 12], [55, 16]],
  [[8, 14], [44, 10], [70, 8]],
  [[25, 18]],
  [[12, 10], [50, 12]],
];

function WeekGridSkeleton() {
  return (
    <div className="-mx-4 animate-pulse overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-hidden>
      {/* Stands in for whichever legend is about to load, so the real grid
          lands where the placeholder was instead of 52px lower. */}
      <div className={`mb-2 flex flex-col items-center justify-center gap-1 ${LEGEND_HEIGHT}`}>
        <Bar className="h-3.5 w-56" />
        <Bar className="h-3 w-72" />
      </div>

      <div className="flex gap-2 text-xs">
        <div className="w-12 shrink-0">
          <div className="mb-1 h-4" />
          <div className={`relative ${COLUMN_HEIGHT}`}>
            {HOUR_LINES.map((top) => (
              // Positions are data, so they stay inline rather than becoming
              // a fixed set of utility classes.
              <Bar key={top} className="absolute right-1 h-2.5 w-8 -translate-y-1/2" style={{ top: `${top}%` }} />
            ))}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-5 gap-2">
          {BLOCKS.map((blocks, day) => (
            <div key={day}>
              <div className="mb-1 flex justify-center">
                <Bar className="h-3 w-8" />
              </div>
              <div
                className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${COLUMN_HEIGHT}`}
              >
                {HOUR_LINES.map((top) => (
                  <div
                    key={top}
                    className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
                    style={{ top: `${top}%` }}
                  />
                ))}
                {blocks.map(([top, height], i) => (
                  <div
                    key={i}
                    className="absolute inset-x-1 rounded-md bg-neutral-200 dark:bg-neutral-800"
                    style={{ top: `${top}%`, height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Cards under "Gaps between classes" — same grid as the real windows. */
function WindowListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="grid animate-pulse gap-1.5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Bar className="h-3.5 w-20 shrink-0" />
            <Bar className="h-3.5 w-24" />
            <Bar className="ml-auto h-3 w-14" />
          </div>
          <Bar className="mt-1.5 h-3 w-40" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The group page while the group state is in flight. `solo` matches the
 * "?view=mine" layout, which drops the member list.
 */
export function GroupPageSkeleton({ solo = false }: { solo?: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6" aria-busy>
      <span className="sr-only">Loading schedule…</span>

      <header className="flex animate-pulse flex-wrap items-start justify-between gap-3" aria-hidden>
        <div className="flex flex-col gap-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-8 w-44 sm:w-72 lg:w-96" />
          <Bar className="h-8 w-20 shrink-0" />
        </div>
      </header>

      <div className="flex animate-pulse flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800" aria-hidden>
        <div className="flex items-center gap-2">
          <Dot className="h-6 w-6" />
          <Bar className="h-4 w-28" />
        </div>
        <Bar className="h-9 w-full" />
      </div>

      {!solo && (
        <section aria-hidden>
          <Bar className="mb-2 h-4 w-24 animate-pulse" />
          <ul className="grid animate-pulse gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {["w-24", "w-20", "w-28", "w-16", "w-24", "w-20"].map((w, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700"
              >
                <Dot className="h-3 w-3 shrink-0" />
                <Dot className="h-[18px] w-[18px] shrink-0" />
                <Bar className={`h-3.5 ${w}`} />
                <Bar className="ml-auto h-3 w-16 shrink-0" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex animate-pulse items-center justify-center gap-2" aria-hidden>
        <Bar className="h-9 w-10" />
        <Bar className="h-5 w-48" />
        <Bar className="h-9 w-10" />
      </div>

      <WeekGridSkeleton />

      <section aria-hidden>
        <Bar className="mb-2 h-4 w-40 animate-pulse" />
        <WindowListSkeleton />
      </section>
    </main>
  );
}

/** Everything below the "Your profile" heading, while /api/me is in flight. */
export function ProfileBodySkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy>
      <span className="sr-only">Loading your profile…</span>

      <section
        className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        aria-hidden
      >
        <Dot className="h-14 w-14 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Bar className="h-4 w-40" />
          <Bar className="h-3.5 w-56" />
          <Bar className="mt-1 h-8 w-36" />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-hidden>
        <Bar className="h-4 w-28" />
        {[0, 1].map((i) => (
          <article
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-center gap-2">
              <Bar className="h-3 w-3 shrink-0" />
              <Bar className="h-4 w-32" />
              <Bar className="h-3.5 w-28" />
              <Bar className="ml-auto h-3.5 w-24" />
            </div>
            <div className="flex items-center gap-3">
              <Bar className="h-3 w-24 shrink-0" />
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <Dot key={j} className="h-5 w-5" />
                ))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Bar className="h-10 flex-1" />
              <Bar className="h-10 w-24 shrink-0" />
            </div>
            <Bar className="h-9 w-full" />
          </article>
        ))}
      </section>
    </div>
  );
}
