"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

/**
 * Both ways in, in one place.
 *
 * Google is first because it is one click and most people will take it. The
 * form under it exists for the people who won't: the whole app is a list of
 * who you spend your week with, and "sign in with Google to see it" is a fair
 * thing to refuse. Nothing about a password account is second-class — same
 * users row, same groups, same schedule.
 *
 * `next` is where to land afterwards. A full navigation rather than a router
 * push, so the new cookie is in play for server components too.
 */
export function SignInPanel({
  next = "/",
  initialMode = "signin",
  toggleHref,
}: {
  next?: string;
  /**
   * Which half to open on. Comes from the URL rather than from a click, so a
   * link to the create-account form survives being pasted to someone else.
   */
  initialMode?: "signin" | "register";
  /**
   * Where the "already have an account?" line goes. Given on the two auth
   * pages, so that switching halves changes the URL to match rather than
   * leaving /signin quietly showing a sign-up form. Omitted anywhere the panel
   * is embedded, where it flips in place instead.
   */
  toggleHref?: string;
}) {
  const [mode, setMode] = useState<"signin" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (register) {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({})))?.error ?? "Could not create that account.");
        setBusy(false);
        return;
      }
    }

    // One code path issues a session, whether the account is a second old or a
    // year: register, then sign in with what was just created.
    const res = await signIn("password", { email, password, redirect: false });
    if (res?.error) {
      setError(
        register
          ? "Account created, but signing in failed. Try signing in below."
          : "That email and password don't match an account."
      );
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: next })}
        className="flex items-center justify-center gap-2.5 rounded-lg border border-neutral-300 px-4 py-2.5 font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        <GoogleMark />
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        or use an email and password
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {register && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            maxLength={120}
            className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@sfu.ca"
          required
          autoComplete="email"
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          // Tells a password manager whether to offer a saved one or a new one.
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? MIN_PASSWORD_LENGTH : undefined}
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {register && (
          <p className="text-xs text-neutral-500">
            At least {MIN_PASSWORD_LENGTH} characters. There&apos;s no password
            reset yet — nothing here sends email — so save it somewhere.
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy
            ? register ? "Creating account…" : "Signing in…"
            : register ? "Create account" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <p className="text-sm text-neutral-500">
        {register ? "Already have an account?" : "No account yet?"}{" "}
        {toggleHref ? (
          <Link href={toggleHref} className={TOGGLE_CLASS}>
            {register ? "Sign in" : "Create one"}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => { setMode(register ? "signin" : "register"); setError(null); }}
            className={TOGGLE_CLASS}
          >
            {register ? "Sign in" : "Create one"}
          </button>
        )}
      </p>
    </div>
  );
}

const TOGGLE_CLASS = "text-blue-600 underline-offset-2 hover:underline dark:text-blue-400";

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H1v2.4A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.5V4.7H1a9 9 0 0 0 0 8.1l2.9-2.2Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 1 4.7l2.9 2.4C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}
