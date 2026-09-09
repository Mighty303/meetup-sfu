"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import { use, useCallback, useEffect, useState } from "react";
import { AuthButton } from "@/components/AuthButton";
import { WeekGrid } from "@/components/WeekGrid";
import type { BusyBlock, FreeWindow, UnscheduledSection } from "@/lib/overlap";
import { formatTime, fromTermCode, scheduleBuilderUrl } from "@/lib/sfu";

interface Member {
  id: number;
  displayName: string;
  color: string;
  classNumbers: string[];
  userId: number | null;
  image: string | null;
}

interface GroupState {
  group: { id: number; code: string; name: string; term: string };
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  unresolved: Record<number, string[]>;
  unscheduled: Record<number, UnscheduledSection[]>;
  week: string;
  termBounds: { start: string; end: string; typicalStart: string } | null;
}

const DAY_LABELS: Record<string, string> = {
  Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday",
};

/** Monday of the week containing `d`, as YYYY-MM-DD. */
function mondayOf(d: Date): string {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return toISODate(m);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Midday avoids the date shifting under daylight-saving transitions. */
function parseISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;

export default function GroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { data: session, status: authStatus } = useSession();

  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Null until the server tells us which week is actually inside the term.
  const [week, setWeek] = useState<string | null>(null);
  const [minMinutes, setMinMinutes] = useState(60);
  const [link, setLink] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/groups/${code}?minMinutes=${minMinutes}${week ? `&week=${week}` : ""}`
    );
    if (!res.ok) {
      setError(res.status === 404 ? "No group with that code." : "Could not load this group.");
      return;
    }
    setError(null);
    const next: GroupState = await res.json();
    setState(next);
    // First load: adopt the server's clamped week so the picker matches the grid.
    setWeek((cur) => cur ?? next.week);
  }, [code, week, minMinutes]);

  // Fetch on mount and whenever the week/duration filters change. The state
  // updates happen after an await, not synchronously, so the cascading-render
  // concern behind this rule doesn't apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Identity comes from the session — no localStorage, so your schedule follows
  // you to any device you sign in on.
  const me = state?.members.find((m) => m.userId === session?.appUserId) ?? null;
  const signedIn = authStatus === "authenticated";
  // Rows with no owner: claimable by whoever signs in and says that's them.
  const unclaimed = state?.members.filter((m) => m.userId === null) ?? [];

  async function claim(memberId: number) {
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members/${memberId}/claim`, { method: "POST" });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setError(null);
    load();
  }

  async function join() {
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members`, { method: "POST" });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setError(null);
    load();
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members/${me.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: link }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    const { classNumbers } = await res.json();
    setError(
      classNumbers.length === 0
        ? "No class numbers found in that — paste the whole sfucourses.com/schedule link."
        : null
    );
    setLink("");
    load();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !newName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members/${me.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: newName }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setError(null);
    setRenaming(false);
    load();
  }

  async function leave() {
    if (!me) return;
    setSaving(true);
    await fetch(`/api/groups/${code}/members/${me.id}`, { method: "DELETE" });
    setSaving(false);
    load();
  }

  if (error && !state) {
    return <main className="mx-auto w-full max-w-lg p-6"><p className="text-red-600">{error}</p></main>;
  }
  if (!state) {
    return <main className="mx-auto w-full max-w-lg p-6 text-neutral-500">Loading…</main>;
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const thisMonday = mondayOf(new Date());

  // Pair each member with their untimetabled sections, dropping anyone who has none.
  const unscheduledMembers = state.members
    .map((m) => [m, state.unscheduled[m.id] ?? []] as const)
    .filter(([, sections]) => sections.length > 0);

  // A week counts as in-term if any of it overlaps the term's date range;
  // paging past either end would just show a grid with no classes on it.
  function weekInTerm(monday: string): boolean {
    const b = state?.termBounds;
    if (!b) return true;
    return addDays(monday, 6) >= b.start && monday <= b.end;
  }

  function canPage(direction: -1 | 1): boolean {
    return week !== null && weekInTerm(addDays(week, direction * 7));
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{state.group.name}</h1>
          <p className="text-sm text-neutral-500">
            {fromTermCode(state.group.term)} · code <span className="font-mono">{state.group.code}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AuthButton />
          <div className="flex items-center gap-2">
            {/* Always visible: clipboard access is unreliable (it silently never
                settles when the document isn't focused), and people want to see
                the link they're sharing anyway. */}
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-44 rounded-lg border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600 sm:w-72 lg:w-96 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            />
            <button
              onClick={() => {
                // Optimistic — the promise may never settle, so don't wait on it.
                setCopyState("copied");
                setTimeout(() => setCopyState("idle"), 2000);
                navigator.clipboard?.writeText(shareUrl).catch(() => setCopyState("failed"));
              }}
              className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {copyState === "copied" ? "Copied ✓" : copyState === "failed" ? "Select & copy ↑" : "Copy link"}
            </button>
          </div>
        </div>
      </header>

      {!signedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="text-neutral-600 dark:text-neutral-300">
            Sign in with Google to add your schedule — you can view the group
            without it. Build your schedule first and it&apos;ll be ready to paste.
          </p>
          <a
            href={scheduleBuilderUrl(state.group.term)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Build it on sfucourses.com ↗
          </a>
        </div>
      ) : !me ? (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          {unclaimed.length > 0 ? (
            <>
              {/* People added before sign-in existed. Claiming keeps their
                  saved schedule instead of making them start over. */}
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Already in this group under one of these names? Pick yours to keep
                your saved schedule.
              </p>
              <div className="flex flex-wrap gap-2">
                {unclaimed.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => claim(m.id)}
                    disabled={saving}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <span style={{ color: m.color }}>{m.displayName}</span>
                    {m.classNumbers.length > 0 && (
                      <span className="text-neutral-500"> · {m.classNumbers.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              You&apos;re not in this group yet.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={join}
              disabled={saving}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {saving ? "Joining…" : unclaimed.length > 0 ? "None of these — add me" : "Join group"}
            </button>
            <a
              href={scheduleBuilderUrl(state.group.term)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              Build it on sfucourses.com ↗
            </a>
            {error && <p className="text-sm text-amber-600">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {renaming ? (
              <form onSubmit={saveName} className="flex flex-wrap items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={me.displayName}
                  autoFocus
                  maxLength={60}
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
                <button disabled={saving} className="rounded-lg bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
                  Save
                </button>
                <button type="button" onClick={() => setRenaming(false)} className="text-sm text-neutral-500">
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                {me.image && (
                  <Image src={me.image} alt="" width={24} height={24} className="rounded-full" />
                )}
                <span className="font-medium" style={{ color: me.color }}>{me.displayName}</span>
                <button
                  onClick={() => { setNewName(me.displayName); setRenaming(true); }}
                  className="text-xs text-neutral-500 underline-offset-2 hover:underline"
                >
                  Rename
                </button>
                <span className="text-neutral-500">
                  {me.classNumbers.length > 0
                    ? `· ${me.classNumbers.length} section${me.classNumbers.length === 1 ? "" : "s"} saved`
                    : "· no schedule yet"}
                </span>
              </div>
            )}
            <a
              href={scheduleBuilderUrl(state.group.term)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              Build it on sfucourses.com ↗
            </a>
          </div>

          {me.classNumbers.length === 0 && (
            <ol className="ml-4 list-decimal text-xs text-neutral-500">
              <li>Open the builder, pick your {fromTermCode(state.group.term)} sections</li>
              <li>Copy the URL from your browser&apos;s address bar</li>
              <li>Paste it here</li>
            </ol>
          )}

          <form onSubmit={saveSchedule} className="flex flex-wrap gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://sfucourses.com/schedule?courses=5446-5447"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
              {saving ? "Saving…" : me.classNumbers.length > 0 ? "Replace" : "Save"}
            </button>
          </form>

          <div className="flex items-center gap-3">
            {error && <p className="text-sm text-amber-600">{error}</p>}
            <button
              onClick={leave}
              disabled={saving}
              className="ml-auto text-xs text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline"
            >
              Leave group
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => week && setWeek(addDays(week, -7))}
            disabled={!canPage(-1)}
            aria-label="Previous week"
            className="rounded-lg border border-neutral-300 px-2 py-1 leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ←
          </button>
          <span className="min-w-[9.5rem] text-center tabular-nums">
            {week ? `${shortDate(week)} – ${shortDate(addDays(week, 4))}` : "—"}
          </span>
          <button
            onClick={() => week && setWeek(addDays(week, 7))}
            disabled={!canPage(1)}
            aria-label="Next week"
            className="rounded-lg border border-neutral-300 px-2 py-1 leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            →
          </button>
          {week !== thisMonday && weekInTerm(thisMonday) && (
            <button
              onClick={() => setWeek(thisMonday)}
              className="ml-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              This week
            </button>
          )}
        </div>
        <label className="flex items-center gap-2">
          At least
          <select value={minMinutes} onChange={(e) => setMinMinutes(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
            {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          {state.members.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5">
              {m.image ? (
                <Image src={m.image} alt="" width={16} height={16} className="rounded-full" />
              ) : (
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: m.color }} />
              )}
              <span style={{ color: m.color }}>{m.displayName}</span>
              {m.classNumbers.length === 0 && (
                <span className="text-neutral-400" title="Not counted in the overlap until they add a schedule">
                  (no schedule yet)
                </span>
              )}
              {state.unresolved[m.id]?.length > 0 && (
                <span className="text-amber-600" title={`Not in ${fromTermCode(state.group.term)}: ${state.unresolved[m.id].join(", ")}`}>
                  ⚠ {state.unresolved[m.id].length}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {!weekInTerm(thisMonday) && (
        <p className="-mt-3 text-xs text-neutral-500">
          Today falls outside {fromTermCode(state.group.term)}, so this starts at
          the first week of term.
        </p>
      )}

      <WeekGrid
        members={state.members}
        busyByMember={state.busyByMember}
        free={state.free}
        dayStart={DAY_START}
        dayEnd={DAY_END}
      />

      <section>
        <h2 className="mb-2 font-medium">
          Everyone free {state.free.some((w) => !w.sharedCampus) && "(green = same campus)"}
        </h2>
        {state.free.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No shared window this week at {minMinutes} min. Try a shorter minimum.
          </p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {state.free.map((w, i) => (
              <li key={i} className="flex items-baseline gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
                <span className="w-20 shrink-0 font-medium">{DAY_LABELS[w.day] ?? w.day}</span>
                <span className="tabular-nums">{formatTime(w.start)} – {formatTime(w.end)}</span>
                <span className="ml-auto text-xs text-neutral-500">
                  {w.campuses.length === 0
                    ? "anywhere"
                    : w.sharedCampus
                      ? w.campuses[0]
                      : `split: ${w.campuses.join(" / ")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {unscheduledMembers.length > 0 && (
        <section>
          <h2 className="mb-1 font-medium">No meeting times</h2>
          <p className="mb-2 text-xs text-neutral-500">
            Online, async, co-op and independent study sections. They have no
            timetable slot, so they don&apos;t appear on the grid or affect the
            free windows above.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {unscheduledMembers.map(([member, sections]) =>
              sections.map((sec) => (
                <li
                  key={`${member.id}-${sec.classNumber}`}
                  className="flex items-baseline gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                >
                  <span className="h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-sm" style={{ backgroundColor: member.color }} />
                  <span className="font-medium">{sec.course}</span>
                  <span className="text-xs text-neutral-500">
                    {sec.section}{sec.sectionCode ? ` ${sec.sectionCode}` : ""}
                  </span>
                  <span className="ml-auto text-xs text-neutral-500">
                    {member.displayName}
                    {sec.deliveryMethod && sec.deliveryMethod !== "In Person" && (
                      <span className="ml-1 text-blue-600 dark:text-blue-400">
                        · {sec.deliveryMethod}
                      </span>
                    )}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
    </main>
  );
}
