import Link from "next/link";
import { SignInPanel } from "@/components/SignInPanel";

/**
 * The sign-in and sign-up pages, which are the same page with two headings and
 * the two halves of SignInPanel.
 *
 * A page of its own rather than a section on the home page: signing in is the
 * one thing on this site you arrive already intending to do, and when it lived
 * under the demo it was three screens of scroll from the button that sent you
 * there. It also gives the act a URL — which is what lets the group page and
 * the profile page send you here and get you back afterwards.
 */
export function AuthScreen({
  mode,
  next,
}: {
  mode: "signin" | "register";
  /** Already passed through safeNext by the page above. */
  next: string;
}) {
  const register = mode === "register";
  // Carried across the toggle, so bouncing between the two doesn't lose where
  // you were headed.
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 p-6 pb-20 sm:pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {register ? "Create an account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {register
            ? "You need one to add your own schedule. Either door works, and the password one never talks to Google."
            : "Welcome back — whichever way you signed up."}
        </p>
      </div>

      <SignInPanel
        initialMode={mode}
        next={next}
        toggleHref={register ? `/signin${query}` : `/signup${query}`}
      />

      <Link
        href="/"
        className="text-sm text-neutral-500 underline-offset-2 hover:underline"
      >
        ← Back to meetup-sfu
      </Link>
    </main>
  );
}
