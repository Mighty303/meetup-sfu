"use client";

import Link from "next/link";
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

      {/* The pitch for an account, not the form for one. A sign-up form sitting
          in the middle of the page put three fields and a provider choice in
          front of someone still deciding whether they wanted any of this; the
          decision is the button, and /signup is where the typing happens. */}
      <section
        id="get-started"
        className="fade-up mx-auto w-full max-w-lg scroll-mt-6 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
        style={{ animationDelay: "240ms" }}
      >
        <h2 className="text-lg font-semibold tracking-tight">Get started</h2>
        <p className="mt-1 mb-5 text-sm text-neutral-600 dark:text-neutral-400">
          You need an account to add your own schedule. Sign in with Google, or
          with an email and password that never touches Google.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-center font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
          >
            Create an account
          </Link>
          <Link
            href="/signin"
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-center font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Below the account section, because creating a group signed out leaves
          it without an admin — it works, and it is not the path to recommend. */}
      <GroupForms startDelay={360} />
    </main>
  );
}
