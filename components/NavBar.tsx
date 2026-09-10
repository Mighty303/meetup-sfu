"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthButton } from "./AuthButton";

interface Membership {
  code: string;
  name: string;
}

export function NavBar() {
  return <Suspense fallback={<div className="h-16 border-b border-neutral-200 dark:border-neutral-800" />}><NavBarContent /></Suspense>;
}

function NavBarContent() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [recent, setRecent] = useState<(Membership & { userId: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const userId = session?.appUserId;

  // "Schedule" has no fixed route — a schedule always belongs to a group. It
  // points at the group you're looking at, or failing that your most recent one.
  const currentCode = pathname.startsWith("/g/") ? pathname.split("/")[2] : null;

  useEffect(() => {
    if (status !== "authenticated" || !userId || currentCode) return;
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.memberships?.length) return;
        // /api/me nests the group under `group` — the flat fields are the
        // member row, whose `name` is your display name, not the group's.
        const m = data.memberships[0];
        setRecent({ code: m.group.code, name: m.group.name, userId });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status, userId, currentCode]);

  const viewParam = searchParams.get("view");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const scheduleCode = currentCode ?? (status === "authenticated" && recent?.userId === userId ? recent?.code : null);
  const signedIn = status === "authenticated";
  const mySchedule = pathname === "/my-schedule" || (!!currentCode && viewParam === "mine");

  const links = (
    <>
      <NavLink href="/" active={pathname === "/"}>Home</NavLink>
      {scheduleCode && (
        <NavLink href={`/g/${scheduleCode}`} active={!!currentCode && !mySchedule}>
          Schedule
        </NavLink>
      )}
      {signedIn && (
        <NavLink
          href={currentCode ? `/g/${currentCode}?view=mine` : "/my-schedule"}
          active={mySchedule}
        >
          My Schedule
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
    </>
  );

  return (
    <nav className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-x-1 p-3 sm:px-6">
        <Link
          href="/"
          className="mr-2 text-base font-semibold tracking-tight hover:opacity-80"
        >
          meetup<span className="text-neutral-400">-sfu</span>
        </Link>

        <div className="hidden items-center gap-x-1 sm:flex">{links}</div>

        <div className="ml-auto hidden sm:block">
          <AuthButton />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="nav-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="ml-auto rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-100 sm:hidden dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {open && (
        <div
          id="nav-menu"
          // Navigating is the whole point of the menu, so a click on any link
          // inside it closes the panel on the way out.
          onClick={() => setOpen(false)}
          className="flex flex-col gap-1 border-t border-neutral-200 p-3 sm:hidden dark:border-neutral-800"
        >
          {links}
          <div className="mt-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
            <AuthButton stacked />
          </div>
        </div>
      )}
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

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
