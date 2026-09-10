"use client";

import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CoursePicker } from "@/components/CoursePicker";
import { HeatGrid } from "@/components/HeatGrid";
import { GroupPageSkeleton } from "@/components/Skeleton";
import { WeekGrid } from "@/components/WeekGrid";
import { blocksFromSection, commonFree, partialFree } from "@/lib/overlap";
import type { BusyBlock, FreeWindow, UnscheduledSection } from "@/lib/overlap";
import { WEEKDAYS, formatTime, fromTermCode } from "@/lib/sfu";
import type { SectionHit } from "@/lib/sfu";

interface Member {
  id: number;
  displayName: string;
  color: string;
  classNumbers: string[];
  userId: number | null;
  image: string | null;
}

/**
 * One row of the group switcher: a group you have a member row in. A slice of
 * what /api/me returns — the rest of that payload is the profile page's.
 */
interface GroupOption {
  memberId: number;
  /** Your colour in that group, so the dot matches its grid. */
  color: string;
  group: { code: string; name: string; term: string };
}

interface GroupState {
  group: {
    id: number;
    code: string;
    name: string;
    term: string;
    /** The group's admin — the only person who can delete it. */
    ownerUserId: number | null;
  };
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

/** Mon-first, so the list reads down the week. Unknown days sort last. */
function dayOrder(day: string): number {
  const i = (WEEKDAYS as readonly string[]).indexOf(day);
  return i === -1 ? WEEKDAYS.length : i;
}

// Shorter than this isn't worth crossing campus for, and nobody was going to
// tune it — so it's fixed rather than a control.
const MIN_MINUTES = 60;

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;

export default function GroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Suspense fallback={<GroupPageSkeleton />}>
      <GroupSchedule key={code} code={code} />
    </Suspense>
  );
}

function GroupSchedule({ code }: { code: string }) {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Null until the server tells us which week is actually inside the term.
  const [week, setWeek] = useState<string | null>(null);
  // Member ids ticked off in the list. Kept as ids, not indices, so it survives
  // someone joining or leaving mid-session.
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  // "mine" narrows the whole page to your own row: your classes at full width
  // and your own gaps, without everyone else's blocks to read past.
  const view = searchParams.get("view") === "mine" ? "mine" : "everyone";
  // Availability — a LettuceMeet-style shading of how many people are free in
  // each half-hour — is the default: it's the reading that answers "when can we
  // meet", and the one that survives five clashing schedules. "detailed" opts
  // back into the labelled blocks. In the URL so a reload — and a shared link —
  // keeps whichever view you were reading.
  const grid = searchParams.get("grid") === "detailed" ? "detailed" : "heat";
  const [showAllPartial, setShowAllPartial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // The section under the cursor in the picker, sketched onto the grid.
  const [preview, setPreview] = useState<{ course: string; section: SectionHit } | null>(null);
  // Deleting is irreversible and takes everyone's schedules, so the button has
  // to be armed first — no dialog, just a second, differently-worded click.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Leaving drops your sections from everyone's view, so it arms the same way.
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The group's own name, which only its admin can change. Null when nobody is
  // editing it; the string being edited otherwise, so "" is a real state.
  const [draftName, setDraftName] = useState<string | null>(null);
  // Every group you're in, for the switcher. Null until the fetch lands.
  const [myGroups, setMyGroups] = useState<GroupOption[] | null>(null);

  const load = useCallback(async () => {
    // No minMinutes here: the page derives its own windows from busyByMember, so
    // changing the duration (or ticking someone off) is instant, not a round-trip.
    const res = await fetch(`/api/groups/${code}${week ? `?week=${week}` : ""}`);
    if (!res.ok) {
      setError(res.status === 404 ? "No group with that code." : "Could not load this group.");
      return;
    }
    setError(null);
    const next: GroupState = await res.json();
    setState(next);
    // First load: adopt the server's clamped week so the picker matches the grid.
    setWeek((cur) => cur ?? next.week);
  }, [code, week]);

  // Fetch on mount and whenever the week/duration filters change. The state
  // updates happen after an await, not synchronously, so the cascading-render
  // concern behind this rule doesn't apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Identity comes from the session — no localStorage, so your schedule follows
  // you to any device you sign in on.
  const signedIn = authStatus === "authenticated";
  const me = signedIn ? state?.members.find((m) => m.userId === session?.appUserId) ?? null : null;
  // Rows with no owner: claimable by whoever signs in and says that's them.
  const unclaimed = state?.members.filter((m) => m.userId === null) ?? [];
  // The group's admin: whoever created it. The server checks this again on the
  // delete itself — this only decides whether the button is worth showing.
  const isAdmin =
    signedIn &&
    state?.group.ownerUserId != null &&
    state.group.ownerUserId === session?.appUserId;

  // Your other groups, so switching between them doesn't mean a trip via Home.
  // Independent of the group fetch: it's keyed on you, not on the code, so it
  // survives navigating from one group to the next.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live && data) setMyGroups(data.memberships); })
      .catch(() => {});
    return () => { live = false; };
  }, [signedIn]);

  /**
   * Where one pill in the switcher points. The detailed/availability choice
   * carries across; the week doesn't, because another group can be another term
   * entirely, so it re-clamps from the server.
   */
  function pillHref(nextCode: string, nextView: "mine" | "everyone"): string {
    const params = new URLSearchParams();
    if (nextView === "mine") params.set("view", "mine");
    if (grid === "detailed") params.set("grid", "detailed");
    return `/g/${nextCode}${params.size > 0 ? `?${params}` : ""}`;
  }

  function setGrid(next: "detailed" | "heat") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "detailed") params.set("grid", "detailed");
    else params.delete("grid");
    // replace, not push: toggling a view isn't a step you want to hit Back through.
    router.replace(`/g/${code}${params.size > 0 ? `?${params}` : ""}`, { scroll: false });
  }

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

  async function leave() {
    if (!me) return;
    setSaving(true);
    await fetch(`/api/groups/${code}/members/${me.id}`, { method: "DELETE" });
    setSaving(false);
    setConfirmLeave(false);
    load();
  }

  async function saveGroupName(e: React.FormEvent) {
    e.preventDefault();
    if (draftName === null || !draftName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draftName }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "could not rename this group"); return; }
    setError(null);
    setDraftName(null);
    load();
  }

  async function deleteGroup() {
    setSaving(true);
    const res = await fetch(`/api/groups/${code}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setConfirmDelete(false);
      setError((await res.json()).error ?? "could not delete this group");
      return;
    }
    // Nothing left at this URL to reload.
    router.push("/");
  }

  // Only people with a schedule can constrain anything — someone who hasn't
  // pasted theirs would read as "free always" and silently widen every window.
  const scheduled = useMemo(
    () =>
      (state?.members ?? []).filter(
        (m) => m.classNumbers.length > 0 || (state?.busyByMember[m.id]?.length ?? 0) > 0
      ),
    [state]
  );
  const shown = useMemo(
    () =>
      view === "mine"
        ? scheduled.filter((m) => m.id === me?.id)
        : scheduled.filter((m) => !hidden.has(m.id)),
    [scheduled, hidden, view, me?.id]
  );

  const schedules = useMemo(
    () => shown.map((m) => ({ name: m.displayName, busy: state?.busyByMember[m.id] ?? [] })),
    [shown, state]
  );

  // Recomputed here rather than refetched. Ticking someone off is a filter over
  // data the page already holds, and a round-trip would make it feel like a
  // reload — the server's own `free` is for API callers, not for this view.
  const free = useMemo(
    () =>
      schedules.length >= (view === "mine" ? 1 : 2)
        ? commonFree({ members: schedules, dayStart: DAY_START, dayEnd: DAY_END, minMinutes: MIN_MINUTES })
        : [],
    [schedules, view]
  );

  const previewBlocks = useMemo(
    () => (preview ? blocksFromSection(preview.course, preview.section) : []),
    [preview]
  );

  // Windows where only part of the group can make it. Two people already on
  // campus is a real meetup, so those sort to the top; the full-group ones are
  // dropped because they're listed on their own above.
  const partial = useMemo(() => {
    if (view === "mine") return [];
    if (schedules.length < 3) return []; // with two, "some of you" is the same list
    return partialFree({
      members: schedules,
      dayStart: DAY_START,
      dayEnd: DAY_END,
      minMinutes: MIN_MINUTES,
    })
      .filter((w) => !w.everyone)
      .sort(
        (a, b) =>
          Number(b.onCampus.length >= 2) - Number(a.onCampus.length >= 2) ||
          b.attendees.length - a.attendees.length ||
          dayOrder(a.day) - dayOrder(b.day) ||
          a.start - b.start
      );
  }, [schedules, view]);

  if (view === "mine" && authStatus === "loading") {
    return <GroupPageSkeleton solo />;
  }
  if (view === "mine" && !signedIn) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-neutral-500">Sign in to see your saved schedule.</p>
        <button
          onClick={() => signIn("google")}
          className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Sign in
        </button>
        <Link href={`/g/${code}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">View group schedule</Link>
      </main>
    );
  }

  if (error && !state) {
    return <main className="mx-auto w-full max-w-lg p-6"><p className="text-red-600">{error}</p></main>;
  }
  if (!state) {
    return <GroupPageSkeleton solo={view === "mine"} />;
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${code}` : "";
  const thisMonday = mondayOf(new Date());

  // Only gaps wedged between classes are worth listing — nobody has to make a
  // special trip for them.
  const gaps = free.filter((w) => w.betweenClasses);

  // Pair each member with their untimetabled sections, dropping anyone who has
  // none — and anyone ticked off, since nothing else on the page counts them.
  const unscheduledMembers = shown
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
          {/* The name is the group's, not a member's, so it's edited here
              rather than on the profile page — and only by the admin. */}
          {draftName !== null ? (
            <form onSubmit={saveGroupName} className="flex flex-wrap items-center gap-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                maxLength={120}
                onKeyDown={(e) => { if (e.key === "Escape") setDraftName(null); }}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-2xl font-semibold tracking-tight dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button
                disabled={saving || !draftName.trim()}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                Save
              </button>
              <button type="button" onClick={() => setDraftName(null)} className="text-sm text-neutral-500">
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {/* The group names the page in both views — the Group/Mine
                  toggle below says which of the two you're reading. */}
              <h1 className="text-2xl font-semibold tracking-tight">{state.group.name}</h1>
              {isAdmin && (
                <button
                  onClick={() => setDraftName(state.group.name)}
                  // Nothing spells out what this does any more, so the icon has
                  // to: a title for the pointer, an aria-label for a reader.
                  aria-label="Rename group"
                  title="Rename group"
                  className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-neutral-500">
            {fromTermCode(state.group.term)} · code <span className="font-mono">{state.group.code}</span>
          </p>
          {view === "mine" && <p className="mt-1 text-sm text-neutral-500">Only your classes and free time are shown.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="shrink-0 text-neutral-500 dark:text-neutral-400"
              >
                {copyState === "copied" ? (
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                ) : (
                  <>
                    <rect x="7.25" y="7.25" width="9" height="9" rx="2" />
                    <path d="M12.75 4.75a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2" />
                  </>
                )}
              </svg>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Select & copy ↑" : "Copy link"}
            </button>
          </div>
        </div>
      </header>

      {/* What you're reading: your own week, or one of your groups as a whole.
          One pill is selected at a time, and switching is a real navigation, so
          these are links — middle-click and Back both behave. */}
      {signedIn && (
        <nav aria-label="Schedule to show" className="-mt-2 flex flex-wrap items-center gap-2">
          <Pill href={pillHref(code, "mine")} current={view === "mine"} title="Only your classes and free time">
            <Avatar src={me?.image ?? null} name={me?.displayName ?? "You"} color={me?.color} size={18} />
            <span className="truncate">My schedule</span>
          </Pill>
          {/* A hairline, so "mine" doesn't read as just another group. */}
          <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-300 dark:bg-neutral-700" />
          {/* Until /api/me lands there's still the group you're on, so the row
              renders at once and fills in rather than popping into place. */}
          {(myGroups ?? [{ memberId: 0, color: me?.color ?? "#a3a3a3", group: state.group }]).map((g) => (
            <Pill
              key={g.group.code}
              href={pillHref(g.group.code, "everyone")}
              current={view === "everyone" && g.group.code === code}
              title={`${g.group.name} · ${fromTermCode(g.group.term)}`}
            >
              {/* Your colour in that group — the same key its grid uses. */}
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="truncate">{g.group.name}</span>
            </Pill>
          ))}
        </nav>
      )}

      {!signedIn ? (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="text-neutral-600 dark:text-neutral-300">
            Sign in with Google to add your schedule — you can view the group
            without it.
          </p>
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
            {error && <p className="text-sm text-amber-600">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          {/* Name and colour are set once on the profile page — they follow you
              into every group, so there's nothing to edit here. */}
          <div className="flex items-center gap-2 text-sm">
            <Avatar src={me.image} name={me.displayName} color={me.color} size={24} />
            <span className="font-medium" style={{ color: me.color }}>{me.displayName}</span>
          </div>

          <CoursePicker
            term={state.group.term}
            groupCode={code}
            memberId={me.id}
            classNumbers={me.classNumbers}
            onChange={load}
            onPreview={setPreview}
          />

          <div className="flex flex-wrap items-center gap-3">
            {error && <p className="text-sm text-amber-600">{error}</p>}
            {confirmLeave ? (
              <span className="ml-auto flex items-center gap-2 text-xs">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Leave {state.group.name}?
                </span>
                <button
                  onClick={leave}
                  disabled={saving}
                  className="rounded-lg bg-red-600 px-2 py-1 font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Leaving…" : "Leave"}
                </button>
                <button onClick={() => setConfirmLeave(false)} className="text-neutral-500">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmLeave(true)}
                disabled={saving}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                <LeaveIcon />
                Leave group
              </button>
            )}
            {isAdmin && (
              confirmDelete ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-600 dark:text-neutral-300">
                    Delete {state.group.name} and everyone&apos;s schedules in it?
                  </span>
                  <button
                    onClick={deleteGroup}
                    disabled={saving}
                    className="rounded-lg bg-red-600 px-2 py-1 font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "Deleting…" : "Delete for everyone"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-neutral-500">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <TrashIcon />
                  Delete group
                </button>
              )
            )}
          </div>
        </div>
      )}

      {view === "everyone" && (
      <section>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-medium">Who&apos;s in</h2>
          <p className="text-xs text-neutral-500">
            Tick someone off and the grid and windows below recompute without
            them — useful when one schedule is blocking every slot.
          </p>
          {shown.length < scheduled.length && (
            <button
              onClick={() => setHidden(new Set())}
              className="ml-auto text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              Include everyone
            </button>
          )}
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {state.members.map((m) => {
            const hasSchedule = scheduled.some((s) => s.id === m.id);
            const on = hasSchedule && !hidden.has(m.id);
            const unresolved = state.unresolved[m.id]?.length ?? 0;
            return (
              <li key={m.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    hasSchedule
                      ? on
                        ? "border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                        : "border-dashed border-neutral-300 opacity-55 hover:opacity-80 dark:border-neutral-700"
                      : "cursor-not-allowed border-dashed border-neutral-200 opacity-55 dark:border-neutral-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!hasSchedule}
                    onChange={() =>
                      setHidden((cur) => {
                        const next = new Set(cur);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      })
                    }
                    className="peer sr-only"
                  />
                  {/* A hairline ring that fills when they're counted — the row
                      already carries the state in its border and opacity, so
                      the toggle only has to hint, not shout. */}
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full border border-neutral-400 transition-colors peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 dark:border-neutral-600 dark:peer-checked:border-white dark:peer-checked:bg-white"
                  />
                  {m.image ? (
                    <Image src={m.image} alt="" width={18} height={18} className="shrink-0 rounded-full" />
                  ) : (
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: m.color }} />
                  )}
                  <span className="truncate font-medium" style={{ color: m.color }}>
                    {m.displayName}
                  </span>
                  {m.userId !== null && m.userId === state.group.ownerUserId && (
                    <span
                      title="Created this group"
                      className="shrink-0 rounded border border-neutral-300 px-1 text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700"
                    >
                      Admin
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-neutral-500">
                    {!hasSchedule
                      ? "no schedule yet"
                      : `${m.classNumbers.length} section${m.classNumbers.length === 1 ? "" : "s"}`}
                  </span>
                  {unresolved > 0 && (
                    <span
                      className="shrink-0 text-xs text-amber-600"
                      title={`Not in ${fromTermCode(state.group.term)}: ${state.unresolved[m.id].join(", ")}`}
                    >
                      ⚠ {unresolved}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        {shown.length < 2 && (
          <p className="mt-2 text-sm text-amber-600">
            {scheduled.length < 2
              ? "Two people need a saved schedule before there's an overlap to find."
              : "Tick at least two people back on — one person alone has nothing to overlap with."}
          </p>
        )}
      </section>
      )}

      {!weekInTerm(thisMonday) && (
        <p className="-mt-3 text-xs text-neutral-500">
          Today falls outside {fromTermCode(state.group.term)}, so this starts at
          the first week of term.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => week && setWeek(addDays(week, -7))}
          disabled={!canPage(-1)}
          aria-label="Previous week"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-lg leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ←
        </button>
        <span className="min-w-[12rem] text-center text-lg font-medium tabular-nums">
          {week ? `${shortDate(week)} – ${shortDate(addDays(week, 4))}` : "—"}
        </span>
        <button
          onClick={() => week && setWeek(addDays(week, 7))}
          disabled={!canPage(1)}
          aria-label="Next week"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-lg leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          →
        </button>
        {week !== thisMonday && weekInTerm(thisMonday) && (
          <button
            onClick={() => setWeek(thisMonday)}
            className="ml-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            This week
          </button>
        )}

        {/* Two readings of the same week. Availability shades each half-hour by
            how many people are free; detailed trades that for the labelled
            blocks, which is what you want when checking one person's classes. */}
        <div className="ml-1 flex overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
          {(["heat", "detailed"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setGrid(mode)}
              aria-pressed={grid === mode}
              className={`px-3 py-1.5 transition-colors ${
                grid === mode
                  ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {mode === "detailed" ? "Detailed" : "Availability"}
            </button>
          ))}
        </div>
      </div>

      {view === "mine" && shown.length === 0 && (
        <p className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
          {me
            ? "You haven't added a schedule yet. Add your courses above to see your week."
            : "Join this group or claim your name above to see your schedule."}
        </p>
      )}

      {grid === "heat" ? (
        <HeatGrid
          members={shown}
          busyByMember={state.busyByMember}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          solo={view === "mine"}
          weekStart={week ?? undefined}
        />
      ) : (
        <WeekGrid
          members={shown}
          busyByMember={state.busyByMember}
          free={free}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          solo={view === "mine"}
          weekStart={week ?? undefined}
          preview={previewBlocks}
          previewColor={me?.color}
        />
      )}

      <section>
        <Collapsible
          title={view === "mine" ? "Your gaps between classes" : "Gaps between classes"}
          count={gaps.length}
          blurb={
            view === "mine"
              ? "Windows with a class on both sides — you're already on campus and have to stay."
              : "Windows with a class on both sides, for everyone ticked on above. Names are the people who have class that day, so they're on campus already — anyone else would be making the trip specially."
          }
        >
        {gaps.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {view === "mine" ? "No hour-long gap between your classes this week" : "No hour-long gap this week for everyone ticked on"}
            {partial.length > 0 && " — tick someone off, or take one of the part-group windows below"}
            .
          </p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {gaps.map((w, i) => (
              <li
                key={i}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  w.sharedCampus
                    ? "border-emerald-500/60 bg-emerald-400/10"
                    : "border-amber-500/50 bg-amber-300/10"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="w-20 shrink-0 font-medium">{DAY_LABELS[w.day] ?? w.day}</span>
                  <span className="tabular-nums">{formatTime(w.start)} – {formatTime(w.end)}</span>
                  <span className="ml-auto text-xs text-neutral-500">
                    {w.campuses.length === 0
                      ? "anywhere"
                      : w.sharedCampus
                        ? w.campuses[0]
                        : `split: ${w.campuses.join(" / ")}`}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                  {w.onCampus.length === 0
                    ? "nobody has class this day — someone has to travel"
                    : view === "mine"
                      ? "you're on campus either side"
                      : `on campus: ${w.onCampus.join(", ")}`}
                </div>
              </li>
            ))}
          </ul>
        )}
        </Collapsible>
      </section>

      {partial.length > 0 && (
        <section>
          <Collapsible
            title="Some of you free"
            count={partial.length}
            blurb="Windows the whole group can't make, but part of it can. Two people already on campus is a meetup nobody has to travel for, so those come first."
          >
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {(showAllPartial ? partial : partial.slice(0, 12)).map((w, i) => {
              const onCampus = w.onCampus.length >= 2;
              return (
                <li
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    onCampus
                      ? "border-emerald-500/40 bg-emerald-400/5"
                      : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="w-20 shrink-0 font-medium">{DAY_LABELS[w.day] ?? w.day}</span>
                    <span className="tabular-nums">{formatTime(w.start)} – {formatTime(w.end)}</span>
                    <span className="ml-auto shrink-0 text-xs text-neutral-500">
                      {w.attendees.length} of {shown.length}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {w.attendees.join(", ")}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                    <span>
                      {w.campuses.length === 0
                        ? "anywhere"
                        : w.sharedCampus
                          ? w.campuses[0]
                          : `split: ${w.campuses.join(" / ")}`}
                    </span>
                    {onCampus && (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        · {w.onCampus.length} on campus
                      </span>
                    )}
                    {w.betweenClasses && <span>· between classes</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {partial.length > 12 && (
            <button
              onClick={() => setShowAllPartial((v) => !v)}
              className="mt-2 text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              {showAllPartial ? "Show fewer" : `Show all ${partial.length}`}
            </button>
          )}
          </Collapsible>
        </section>
      )}

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

/**
 * A section folded away behind its own heading, closed until you ask for it.
 * Native <details>: keyboard and screen-reader behaviour come for free, and
 * taking it back out is deleting one wrapper rather than unpicking state.
 */
function Collapsible({
  title,
  count,
  blurb,
  children,
}: {
  title: string;
  /** Shown on the closed row, so folding it away doesn't hide whether it's empty. */
  count: number;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 translate-y-px text-neutral-400 transition-transform group-open:rotate-90"
        >
          <path d="M4 2l4 4-4 4" />
        </svg>
        <h2 className="font-medium">{title}</h2>
        <span className="text-xs text-neutral-500">{count}</span>
      </summary>
      <p className="mt-1 mb-2 pl-5 text-xs text-neutral-500">{blurb}</p>
      <div className="pl-5">{children}</div>
    </details>
  );
}

/** One option in the schedule switcher. Selected reads as filled, like the nav. */
function Pill({
  href,
  current,
  title,
  children,
}: {
  href: string;
  current: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      title={title}
      className={`flex max-w-[14rem] items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        current
          ? "border-neutral-900 bg-neutral-900 font-medium text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}

function PencilIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M13.75 3.25l3 3-9.5 9.5-3.75.75.75-3.75 9.5-9.5z" />
      <path d="M12.25 4.75l3 3" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {/* Door, then an arrow stepping out of it. */}
      <path d="M11.5 3.25h4.25v13.5H11.5" />
      <path d="M8.75 10h-6" />
      <path d="M5.5 7l-2.75 3 2.75 3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M3.5 6h13" />
      <path d="M8 3.5h4" />
      <path d="M5.25 6l.75 10.25h8l.75-10.25" />
      <path d="M8.5 9v4.75M11.5 9v4.75" />
    </svg>
  );
}
