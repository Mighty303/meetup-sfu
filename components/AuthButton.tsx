"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";

export function AuthButton() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />;
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("google")}
        className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        <GoogleMark />
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {session.user.image && (
        <Image
          src={session.user.image}
          alt=""
          width={28}
          height={28}
          className="rounded-full"
        />
      )}
      <span className="max-w-[7rem] truncate text-sm text-neutral-600 sm:max-w-none dark:text-neutral-300">
        {session.user.name ?? session.user.email}
      </span>
      <button
        onClick={() => signOut()}
        className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Sign out
      </button>
    </div>
  );
}


function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H1v2.4A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.5V4.7H1a9 9 0 0 0 0 8.1l2.9-2.2Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 1 4.7l2.9 2.4C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}
