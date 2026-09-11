import { Bar } from "@/components/Skeleton";

/**
 * "/" reads the session to decide which of its two halves to render, so it is
 * a dynamic route now and a click on Home would otherwise sit on the old page
 * until that read came back.
 *
 * Shaped like the signed-in half — a list of group cards over the two forms —
 * because anyone pressing Home in the navigation is signed in by definition.
 * The signed-out half is reached by arriving at the URL, which gets the page
 * itself rather than this.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl animate-pulse flex-col gap-8 p-6 pb-20 sm:pb-24">
      <section className="mx-auto w-full max-w-lg flex flex-col gap-2">
        <Bar className="h-4 w-24" />
        <ul className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="flex gap-4 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
            >
              <Bar className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-3">
                <Bar className="h-5 w-40" />
                <Bar className="h-3.5 w-56" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto w-full max-w-lg flex flex-col gap-3">
        <Bar className="h-4 w-28" />
        <Bar className="h-10" />
        <Bar className="h-10" />
        <Bar className="h-10" />
      </div>
    </main>
  );
}
