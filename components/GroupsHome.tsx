"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GroupForms } from "@/components/GroupForms";
import { fromTermCode } from "@/lib/sfu";

interface Membership {
  memberId: number;
  displayName: string;
  color: string;
  classNumbers: string[];
  group: { id: number; code: string; name: string; term: string };
  members: {
    id: number;
    displayName: string;
    color: string;
    image: string | null;
    hasSchedule: boolean;
  }[];
}

// Names shown on a group card before the rest collapse into a count, so
// every card in the list is exactly one member-row tall.
const MEMBER_PREVIEW = 3;

/**
 * What "/" is once you're signed in: the groups you're in, and the two ways to
 * get into another one. No pitch and no demo — see LandingHome for where those
 * went and why.
 */
export function GroupsHome() {
  // Null until the fetch lands, which is the difference between "still
  // loading" and "you aren't in any".
  const [memberships, setMemberships] = useState<Membership[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live && data) setMemberships(data.memberships); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6 pb-20 sm:pb-24">
      <section className="fade-up mx-auto w-full max-w-lg flex flex-col gap-2">
        <h2 className="text-sm font-medium">Your groups</h2>

        {memberships === null ? (
          /* A blank gap where the list is about to appear reads as "you have
             none", which is a different and more discouraging thing. */
          <ul className="flex flex-col gap-3" aria-hidden>
            {[
              { name: "w-32", chips: ["w-20", "w-24", "w-16"] },
              { name: "w-24", chips: ["w-16", "w-20", "w-14"] },
            ].map((row, i) => (
              <li
                key={i}
                className="flex animate-pulse gap-4 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
              >
                <div className="h-11 w-11 shrink-0 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-5 rounded bg-neutral-200 dark:bg-neutral-800 ${row.name}`} />
                    <div className="h-4 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="ml-auto h-4 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                  <div className="flex h-5 items-center gap-x-3">
                    {row.chips.map((w, j) => (
                      <div key={j} className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                        <div className={`h-3.5 rounded bg-neutral-200 dark:bg-neutral-800 ${w}`} />
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : memberships.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-500 dark:border-neutral-700">
            You&apos;re not in any groups yet. Start one below and send the link
            to the people you want to find time with, or join theirs with a code.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {memberships.map((m) => (
              <li key={m.memberId}>
                <Link
                  href={`/g/${m.group.code}`}
                  className="flex gap-4 rounded-xl border border-neutral-200 p-5 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  {/* Tinted with your own colour in this group, so the card
                      carries the same identity the schedule grid uses. */}
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${m.color}22`, color: m.color }}
                  >
                    <GroupIcon />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-baseline gap-2 text-base">
                      <span className="truncate font-medium">{m.group.name}</span>
                      <span className="shrink-0 text-sm text-neutral-500">{fromTermCode(m.group.term)}</span>
                      <span className="ml-auto shrink-0 text-sm text-neutral-500">
                        {m.classNumbers.length > 0
                          ? `you: ${m.classNumbers.length} section${m.classNumbers.length === 1 ? "" : "s"}`
                          : "you: no schedule yet"}
                      </span>
                    </div>
                    {/* Who else is in it — the fastest way to tell two groups
                        apart when their names are both three letters long.
                        Capped at MEMBER_PREVIEW so every card is one row tall
                        and the list stays scannable; the rest are a count. */}
                    <div className="flex h-5 items-center gap-x-3 overflow-hidden text-sm">
                      {m.members.slice(0, MEMBER_PREVIEW).map((p) => (
                        <span
                          key={p.id}
                          className={`flex min-w-0 items-center gap-1.5 ${p.hasSchedule ? "" : "opacity-50"}`}
                          title={p.hasSchedule ? undefined : "no schedule yet"}
                        >
                          {p.image ? (
                            <Image src={p.image} alt="" width={20} height={20} className="shrink-0 rounded-full" />
                          ) : (
                            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                          )}
                          <span className="truncate" style={{ color: p.color }}>{p.displayName}</span>
                        </span>
                      ))}
                      {m.members.length > MEMBER_PREVIEW && (
                        <span
                          className="shrink-0 text-neutral-500"
                          title={m.members.slice(MEMBER_PREVIEW).map((p) => p.displayName).join(", ")}
                        >
                          +{m.members.length - MEMBER_PREVIEW} more…
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GroupForms startDelay={120} />
    </main>
  );
}

function GroupIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16c0-2.5 2.2-4.25 5-4.25S12.5 13.5 12.5 16" />
      <path d="M13.25 5.1a2.75 2.75 0 0 1 0 5.3" />
      <path d="M14.5 12.2c1.9.5 3 1.9 3 3.8" />
    </svg>
  );
}
