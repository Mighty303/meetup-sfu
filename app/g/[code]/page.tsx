"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CalendarTools } from "@/components/CalendarTools";
import { CoursePicker } from "@/components/CoursePicker";
import { HeatGrid } from "@/components/HeatGrid";
import { GroupPageSkeleton } from "@/components/Skeleton";
import { WeekGrid } from "@/components/WeekGrid";
import { blocksFromSection, commonFree } from "@/lib/overlap";
import type { BusyBlock, FreeWindow, UnscheduledSection } from "@/lib/overlap";
import { fromTermCode } from "@/lib/sfu";
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
  // Which of the two week views to draw, when the URL says. In the URL so a
  // reload — and a shared link — keeps whichever view you were reading; absent,
  // the group's own size decides (see `grid`, below the member counts).
  const gridParam = searchParams.get("grid");
  const pinnedGrid = gridParam === "detailed" || gridParam === "heat" ? gridParam : null;
  const [saving, setSaving] = useState(false);
  // Furniture, not a reading of the data — so it stays in component state
  // rather than in the URL the way `grid` does. A shared link shouldn't decide
  // whether the person opening it sees the member list.
  const [listOpen, setListOpen] = useState(true);
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
    // The pin travels, the derived choice doesn't: carrying this group's answer
    // into another one would pin a view the reader never picked. It doesn't
    // travel to your own schedule at all, which has only the one reading.
    if (pinnedGrid && nextView !== "mine") params.set("grid", pinnedGrid);
    return `/g/${nextCode}${params.size > 0 ? `?${params}` : ""}`;
  }

  function setGrid(next: "detailed" | "heat") {
    const params = new URLSearchParams(searchParams.toString());
    // Both values are written, not just the non-default one: with no param the
    // view is chosen by group size, so "clean URL" no longer means "heat".
    params.set("grid", next);
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

  /**
   * Two readings of the same week, and which one a group opens on depends on
   * how many schedules are in it.
   *
   * Availability shades each band by how many people are free, and past two
   * schedules it's the only view that survives the clash — that's why it used
   * to be the flat default. But it draws no classes at all, so a group with one
   * or two schedules in it opens on a heatmap of almost nothing, which is
   * exactly the group every new user is looking at. The labelled blocks say
   * what's actually in the way, so those come first until the third schedule
   * lands.
   *
   * `view=mine` isn't a choice at all: Availability shades a band by how many
   * of you are free, and with one schedule that ramp has two steps — free and
   * not — which the labelled blocks already say, with the course names written
   * on them. So the toggle isn't offered there, and the pin doesn't apply
   * either, or a link carrying `grid=heat` would land you on a two-colour
   * heatmap with nothing on screen to leave it by.
   *
   * `scheduled` is known before the first render — the page is gated on
   * `state` below — so this never flips under the reader.
   */
  const grid: "detailed" | "heat" =
    view === "mine" ? "detailed" : (pinnedGrid ?? (scheduled.length < 3 ? "detailed" : "heat"));

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

  if (view === "mine" && authStatus === "loading") {
    return <GroupPageSkeleton solo />;
  }
  if (view === "mine" && !signedIn) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-neutral-500">Sign in to see your saved schedule.</p>
        {/* `next` so signing in lands back on this group's week rather than on
            the home page, which is the whole reason the param exists. */}
        <Link
          href={`/signin?next=${encodeURIComponent(`/g/${code}?view=mine`)}`}
          className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          Sign in
        </Link>
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
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-5 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
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
        <div className="flex w-full flex-col gap-2 lg:w-auto">
          <div>
            <h2 className="font-medium">Invite link</h2>
            <p className="text-xs text-neutral-500">
              Anyone with this can open the group and add their own schedule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Always visible: clipboard access is unreliable (it silently never
                settles when the document isn't focused), and people want to see
                the link they're sharing anyway. */}
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-48 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 sm:w-80 lg:w-[26rem] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            />
            <button
              onClick={() => {
                // Optimistic — the promise may never settle, so don't wait on it.
                setCopyState("copied");
                setTimeout(() => setCopyState("idle"), 2000);
                navigator.clipboard?.writeText(shareUrl).catch(() => setCopyState("failed"));
              }}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <svg
                width="17"
                height="17"
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
        <div className="-mt-2 flex flex-col gap-2">
        <h2 className="font-medium">Your groups</h2>
        <nav aria-label="Schedule to show" className="flex flex-wrap items-center gap-2">
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
        </div>
      )}

      {!signedIn ? (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="text-neutral-600 dark:text-neutral-300">
            Sign in to add your schedule — you can view the group without it.
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
        <div className="flex flex-col gap-6 rounded-xl border border-neutral-200 p-5 sm:p-6 dark:border-neutral-800">
          {/* Name and colour are set once on the profile page — they follow you
              into every group, so there's nothing to edit here. */}
          <h2 className="font-medium">Your schedule</h2>

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

      {/* The people and the week they add up to, side by side from `lg`. Ticking
          someone off is a question asked *of* the grid, and with the list a
          screen above it you had to scroll back and forth to see the answer.
          Below `lg` there is no room for a second column, so they stack in the
          old order and the list keeps its own multi-column layout. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* The handle on its right edge folds it away sideways, which is the
          point on a laptop: the detailed grid truncates course codes to make
          room for this column, and collapsed it hands all of that back. The
          arrow stays put across both states — it is the edge of the list, so
          it is where you reach for the list whether it is open or not. */}
      {view === "everyone" && (
      <aside
        className={`flex flex-col gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:shrink-0 ${
          listOpen ? "lg:w-56 xl:w-64" : "lg:w-auto"
        }`}
      >
        {/* justify-end plus mr-auto on the headings, rather than absolute
            positioning: collapsed there is nothing else in this row, and the
            arrow still lands on the right edge without the aside needing a
            height of its own. */}
        <div className="flex items-start justify-end gap-x-3">
          {listOpen && (
            <div className="mr-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-medium">Group Member List</h2>
              <p className="text-xs text-neutral-500">
                Click a name to toggle them out
              </p>
              {shown.length < scheduled.length && (
                <button
                  onClick={() => setHidden(new Set())}
                  className="text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  Include everyone
                </button>
              )}
            </div>
          )}
          {/* The heading stays when it's folded away, so the rail says what
              it is rather than leaving a bare arrow to be guessed at. It costs
              some of the width the collapse was buying back, which is the
              right trade — an unlabelled control nobody presses saves nothing. */}
          {!listOpen && <span className="mr-auto font-medium whitespace-nowrap">Group Member List</span>}
          <CollapseHandle open={listOpen} onToggle={() => setListOpen((v) => !v)} />
        </div>
        {listOpen && (
        <>
        {/* The scroll lives on the list alone, so a long group scrolls under a
            heading and a note that stay put. `min-h-0` because a flex child
            defaults to its content's height and would push the column past the
            viewport instead of scrolling inside it. */}
        <ul id="group-list" className="grid gap-2 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:overflow-y-auto xl:grid-cols-1">
          {state.members.map((m) => {
            const hasSchedule = scheduled.some((s) => s.id === m.id);
            const on = hasSchedule && !hidden.has(m.id);
            const unresolved = state.unresolved[m.id]?.length ?? 0;
            return (
              <li key={m.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
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
        {/* Why the grid below isn't answering the question yet. Three
            different problems with three different fixes, so they get three
            lines — but a line each, in a column this narrow. */}
        {shown.length < 2 && (
          <p className="text-sm text-amber-600 lg:text-xs">
            {scheduled.length === 0
              ? "No schedules yet. Add yours, then share the link."
              : scheduled.length === 1
                ? "One schedule so far. Share the link to find overlap."
                : "Tick two people back on to see an overlap."}
          </p>
        )}
        </>
        )}
      </aside>
      )}

      <div className="@container flex min-w-0 flex-1 flex-col gap-6">
      {!weekInTerm(thisMonday) && (
        <p className="text-xs text-neutral-500">
          Today falls outside {fromTermCode(state.group.term)}, so this starts at
          the first week of term.
        </p>
      )}

      {/* Three tracks so the date sits dead centre no matter what flanks it:
          the "This week" button comes and goes, and the toggle is wider than
          it, so putting either beside the arrows would drag the date off
          centre. Otherwise there is one wrapped, centred row.

          A container query, not a media query: what decides whether the three
          tracks fit is the width of this column, and that stopped tracking the
          viewport the day the member list started sitting beside it. The
          threshold is what the layout actually costs — the outer tracks are
          `1fr` each, so the empty left one is forced to mirror the right one,
          and the row needs twice the controls plus the date. Under that it
          squeezed instead, clipping "Detailed" and wrapping "Export Calendar"
          onto two lines. */}
      <div className="flex flex-wrap items-center justify-center gap-2 @min-[68rem]:grid @min-[68rem]:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2 @min-[68rem]:justify-self-start">
          {week !== thisMonday && weekInTerm(thisMonday) && (
            <button
              onClick={() => setWeek(thisMonday)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              This week
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
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
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 @min-[68rem]:flex-nowrap @min-[68rem]:justify-self-end">
          {/* Two readings of the same week, and picking one here pins it —
              otherwise `grid` above decides from how many schedules are in.
              Absent on your own schedule, where there is only one reading. */}
          {view !== "mine" && (
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
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
          )}

          {/* Same row as the view toggle: these all act on the week on screen,
              and "this week's free windows" means whichever week that is. */}
          <CalendarTools groupCode={code} memberId={me?.id ?? null} />
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

      {/* Directly under the grid, because that is where you go looking for a
          course you know someone is taking and can't find a block for. Set
          further off than the column's own gap: the grid ends on a row of
          empty evening cells, so a heading 24px under it reads as part of
          Friday rather than as the next thing. */}
      {unscheduledMembers.length > 0 && (
        <section className="my-6 sm:my-8">
          <h2 className="mb-1 font-medium">Async Classes</h2>
          <p className="mb-2 text-xs text-neutral-500">
            Online, async, co-op and independent study sections. They have no
            timetable slot, so they don&apos;t appear on the grid or affect the
            shading.
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
      </div>
      </div>

    </main>
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

/**
 * The member list's collapse handle, on its right edge.
 *
 * Points the way the list will move: left to fold it away, right to bring it
 * back. The arrow never moves between the two states, so it stays the thing
 * you reach for either way.
 */
function CollapseHandle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? "Collapse group member list" : "Expand group member list";
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="group-list"
      aria-label={label}
      title={label}
      className="-mr-1 shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={`transition-transform ${open ? "rotate-180" : ""}`}
      >
        <path d="M4 2l4 4-4 4" />
      </svg>
    </button>
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
