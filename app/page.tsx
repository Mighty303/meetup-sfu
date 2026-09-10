"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoAvailability } from "@/components/DemoAvailability";
import { currentTermCode, fromTermCode } from "@/lib/sfu";

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

const TERMS = (() => {
  const now = new Date();
  const seasons = ["spring", "summer", "fall"];
  const out: string[] = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const s of seasons) out.push(`${year}-${s}`);
  }
  return out;
})();

export default function Home() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  // Null until the fetch lands. Kept on sign-out too, but the render is gated
  // on the session, so a stale list never shows.
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [name, setName] = useState("");
  const [term, setTerm] = useState(currentTermCode());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in on a device you've used before means your groups already exist;
  // making you dig the invite code back out of a chat would be silly.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let live = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live && data) setMemberships(data.memberships); })
      .catch(() => {});
    return () => { live = false; };
  }, [authStatus]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, term }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "could not create group");
      setBusy(false);
      return;
    }
    const group = await res.json();
    router.push(`/g/${group.code}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col justify-center gap-8 p-6 pb-20 sm:pb-24">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">meetup-sfu</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Everyone drops their SFU schedule in. The grid shows when you&apos;re all free
          on campus at the same time.
        </p>
      </div>

      {/* The pitch above, as something you can actually look at. Invented
          people on invented courses — see DemoAvailability. */}
      <section className="flex flex-col gap-5">
        <h2 className="text-center text-sm font-medium">What it looks like</h2>
        <DemoAvailability />
      </section>

      {/* Groups arrive a fetch after the session does; a blank gap where the
          list is about to appear reads as "you have none". */}
      {authStatus === "authenticated" && memberships === null && (
        <section className="mx-auto w-full max-w-lg flex flex-col gap-2" aria-hidden>
          <h2 className="text-sm font-medium">Your groups</h2>
          <ul className="flex flex-col gap-3">
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
        </section>
      )}

      {authStatus === "authenticated" && memberships && memberships.length > 0 && (
        <section className="mx-auto w-full max-w-lg flex flex-col gap-2">
          <h2 className="text-sm font-medium">Your groups</h2>
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
        </section>
      )}

      <form onSubmit={create} className="mx-auto w-full max-w-lg flex flex-col gap-3">
        <label className="text-sm font-medium">Start a group</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CMPT study crew"
          required
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <select
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {TERMS.map((t) => (
            <option key={t} value={t}>{fromTermCode(t)}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Creating…" : "Create group"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <form
        onSubmit={(e) => { e.preventDefault(); router.push(`/g/${code.trim().toUpperCase()}`); }}
        className="mx-auto w-full max-w-lg flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800"
      >
        <label className="text-sm font-medium">Or join with a code</label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC1234"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 font-mono uppercase dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button type="submit" className="rounded-lg border border-neutral-300 px-4 dark:border-neutral-700">
            Go
          </button>
        </div>
      </form>
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
