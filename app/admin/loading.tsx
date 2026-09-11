import { Bar } from "@/components/Skeleton";

/**
 * The admin portal is `force-dynamic` and counts rows across every table, so
 * it is the slowest route in the app to render. Without a fallback here the
 * click did nothing at all until the whole page was ready — and, because a
 * dynamic route only prefetches down to its nearest loading boundary, there
 * was nothing to prefetch either.
 *
 * Shaped like the real page: title, the stat strip, then the two panels.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] animate-pulse flex-col gap-8 p-4 sm:p-6">
      <Bar className="h-8 w-32" />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <Bar className="h-3 w-20" />
            <Bar className="h-6 w-12" />
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {[5, 8].map((rows, i) => (
          <section
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800"
          >
            <Bar className="h-3 w-28" />
            {Array.from({ length: rows }, (_, r) => (
              <Bar key={r} className="h-4" style={{ width: `${90 - r * 6}%` }} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
