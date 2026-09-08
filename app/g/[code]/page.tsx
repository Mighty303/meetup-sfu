"use client";

import { use, useCallback, useEffect, useState } from "react";
import { WeekGrid } from "@/components/WeekGrid";
import type { BusyBlock, FreeWindow } from "@/lib/overlap";
import { formatTime, fromTermCode, scheduleBuilderUrl } from "@/lib/sfu";

interface Member {
  id: number;
  displayName: string;
  color: string;
  classNumbers: string[];
}

interface GroupState {
  group: { id: number; code: string; name: string; term: string };
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  unresolved: Record<number, string[]>;
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
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;

export default function GroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Null until the server tells us which week is actually inside the term.
  const [week, setWeek] = useState<string | null>(null);
  const [minMinutes, setMinMinutes] = useState(60);
  const [meId, setMeId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
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

  // Which member this browser is, so pasting a link updates the right person.
  // This can't be a useState initializer: the page server-renders, where
  // localStorage doesn't exist, and reading it during render would break
  // hydration. An effect after mount is the correct place for it.
  useEffect(() => {
    const saved = localStorage.getItem(`meetup-sfu:${code}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setMeId(Number(saved));
  }, [code]);

  const me = state?.members.find((m) => m.id === meId) ?? null;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    const member = await res.json();
    localStorage.setItem(`meetup-sfu:${code}`, String(member.id));
    setMeId(member.id);
    setName("");
    load();
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!meId) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members/${meId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: link }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    const { classNumbers } = await res.json();
    if (classNumbers.length === 0) setError("No class numbers found in that — paste the whole sfucourses.com/schedule link.");
    else setError(null);
    setLink("");
    load();
  }

  if (error && !state) {
    return <main className="mx-auto w-full max-w-lg p-6"><p className="text-red-600">{error}</p></main>;
  }
  if (!state) {
    return <main className="mx-auto w-full max-w-lg p-6 text-neutral-500">Loading…</main>;
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const sharedWindows = state.free.filter((w) => w.sharedCampus);

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{state.group.name}</h1>
          <p className="text-sm text-neutral-500">
            {fromTermCode(state.group.term)} · code <span className="font-mono">{state.group.code}</span>
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
      </header>

      {!me ? (
        <form onSubmit={join} className="flex flex-wrap gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
            Join
          </button>
          <p className="w-full text-xs text-neutral-500">
            Then paste your schedule from{" "}
            <a
              href={scheduleBuilderUrl(state.group.term)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              sfucourses.com/schedule
            </a>
            .
          </p>
        </form>
      ) : (
        <form onSubmit={saveSchedule} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm">
              <span className="font-medium" style={{ color: me.color }}>{me.displayName}</span>
              {me.classNumbers.length > 0
                ? ` — ${me.classNumbers.length} section${me.classNumbers.length === 1 ? "" : "s"} saved. Paste a new link to replace them.`
                : " — paste your schedule link below"}
            </label>
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
          <div className="flex flex-wrap gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://sfucourses.com/schedule?courses=5446-5447"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {error && <p className="text-sm text-amber-600">{error}</p>}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Week of
          <input type="date" value={week ?? ""} min={state.termBounds?.start} max={state.termBounds?.end}
            onChange={(e) => e.target.value && setWeek(mondayOf(new Date(`${e.target.value}T12:00:00`)))}
            className="rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" />
        </label>
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
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: m.color }} />
              {m.displayName}
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

      {state.week !== mondayOf(new Date()) && (
        <p className="-mt-3 text-xs text-neutral-500">
          Showing the week of {state.week} — today falls outside {fromTermCode(state.group.term)}.
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
          Everyone free {sharedWindows.length !== state.free.length && "(green = same campus)"}
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
    </main>
  );
}
