"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthButton } from "./AuthButton";

export function NavBar() {
  return <Suspense fallback={<div className="h-16 border-b border-neutral-200 dark:border-neutral-800" />}><NavBarContent /></Suspense>;
}

function NavBarContent() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Group schedules are reached from the home page, which lists them; the nav
  // only needs the group you're already looking at, for the "My Schedule" link.
  const currentCode = pathname.startsWith("/g/") ? pathname.split("/")[2] : null;

  const viewParam = searchParams.get("view");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const signedIn = status === "authenticated";
  // Server-side flag, so the allowlist never ships in the client bundle.
  const isAdmin = signedIn && session?.isAdmin === true;
  const mySchedule = pathname === "/my-schedule" || (!!currentCode && viewParam === "mine");

  const links = (
    <>
      <NavLink href="/" active={pathname === "/"}>Home</NavLink>
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
      {isAdmin && (
        <NavLink href="/admin" active={pathname === "/admin"}>Admin</NavLink>
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
