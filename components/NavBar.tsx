"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthButton } from "./AuthButton";

interface Membership {
  code: string;
  name: string;
}

export function NavBar() {
  const { status } = useSession();
  const pathname = usePathname();
  const [recent, setRecent] = useState<Membership | null>(null);

  // "Schedule" has no fixed route — a schedule always belongs to a group. It
  // points at the group you're looking at, or failing that your most recent one.
  const currentCode = pathname.startsWith("/g/") ? pathname.split("/")[2] : null;

  useEffect(() => {
    if (status !== "authenticated" || currentCode) return;
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.memberships?.length) return;
        // /api/me nests the group under `group` — the flat fields are the
        // member row, whose `name` is your display name, not the group's.
        const m = data.memberships[0];
        setRecent({ code: m.group.code, name: m.group.name });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status, currentCode]);

  const scheduleCode = currentCode ?? recent?.code ?? null;
  const signedIn = status === "authenticated";

  return (
    <nav className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-1 gap-y-2 p-3 sm:px-6">
        <Link
          href="/"
          className="mr-2 text-base font-semibold tracking-tight hover:opacity-80"
        >
          meetup<span className="text-neutral-400">-sfu</span>
        </Link>

        <NavLink href="/" active={pathname === "/"}>Home</NavLink>
        {scheduleCode && (
          <NavLink href={`/g/${scheduleCode}`} active={pathname.startsWith("/g/")}>
            Schedule
          </NavLink>
        )}
        {signedIn && (
          <NavLink
            href={currentCode ? `/profile?from=${encodeURIComponent(currentCode)}` : "/profile"}
            active={pathname === "/profile"}
          >
            Profile
          </NavLink>
        )}

        <div className="ml-auto">
          <AuthButton />
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}
