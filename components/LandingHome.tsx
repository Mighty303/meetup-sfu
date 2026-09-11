"use client";

import { DemoAvailability } from "@/components/DemoAvailability";
import { GroupForms } from "@/components/GroupForms";

/**
 * What "/" is for someone who hasn't signed in: what the thing is, a worked
 * example of it, and the two ways in.
 *
 * The pitch and the demo live here rather than on the home page proper because
 * they answer a question you only ask once. Someone already in three groups is
 * not still wondering what the grid means, and making them scroll past an
 * explanation of it to reach their own groups is the kind of thing that makes
 * a tool feel like a brochure.
 */
export function LandingHome() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col justify-center gap-8 p-6 pb-20 sm:pb-24">
      {/* Staggered a couple of hundred milliseconds apart: the page is four
          blocks stacked down the middle, and arriving together makes them read
          as one wall. Inline delays rather than nth-child utilities, because
          the two halves of the home page have different numbers of blocks and
          a positional rule would have to be rewritten per half. */}
      <div className="fade-up mx-auto w-full max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">meetup-sfu</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Everyone drops their SFU schedule in. The grid shows when you&apos;re all free
          on campus at the same time.
        </p>
      </div>

      {/* The pitch above, as something you can actually look at. Invented
          people on invented courses — see DemoAvailability. */}
      <section className="fade-up flex flex-col gap-5" style={{ animationDelay: "120ms" }}>
        <h2 className="text-center text-sm font-medium">What it looks like</h2>
        <DemoAvailability />
      </section>

      <GroupForms startDelay={240} />
    </main>
  );
}
