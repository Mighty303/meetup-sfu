"use client";

import { useEffect, useState } from "react";
import type { CourseHit, SectionHit } from "@/lib/sfu";

interface Props {
  /** The term this schedule is for, e.g. "2026-fall" — searches are scoped to it. */
  term: string;
  /**
   * A member row of yours in a group of that term, and the group it's in. Only
   * a route to the API: an add or remove lands on your profile schedule for the
   * term, so which of your rows it travels through makes no difference.
   */
  groupCode: string;
  memberId: number;
  /** Class numbers already saved, so the picker can mark and unmark them. */
  classNumbers: string[];
  /** Called after every add or remove so the page can refresh the grid. */
  onChange: () => void;
  /**
   * Fired with the section under the cursor, and null on the way out, so the
   * page can sketch it onto the grid before it's saved. Omitted where there is
   * no grid to sketch on.
   */
  onPreview?: (hit: { course: string; section: SectionHit } | null) => void;
}

/** Sized to the button's text so swapping one for the other moves nothing. */
function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function courseCode(c: CourseHit): string {
  return `${c.dept} ${c.number}`;
}

/** "Mo, We 10:30–11:20 · Burnaby", or "no meeting time" for async sections. */
function meetingLabel(s: SectionHit): string {
  const timed = s.meetings.filter((m) => m.days.trim() !== "");
  if (timed.length === 0) return "no meeting time";
  return timed
    .map((m) => `${m.days} ${m.startTime}–${m.endTime}${m.campus ? ` · ${m.campus}` : ""}`)
    .join("  |  ");
}

export function CoursePicker({ term, groupCode, memberId, classNumbers, onChange, onPreview }: Props) {
  const [query, setQuery] = useState("");
  // Tagged with the query they answer, so a result set never outlives its box.
  const [hits, setHits] = useState<{ q: string; courses: CourseHit[] }>({ q: "", courses: [] });
  const [saved, setSaved] = useState<CourseHit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedSet = new Set(classNumbers);
  // Results belong to whatever is in the box now; a stale list from the
  // previous query would otherwise flash while the new one is in flight.
  const key = classNumbers.join(",");

  // Saved sections come back as course codes so the chips read "CMPT 225 D100"
  // instead of a bare class number.
  useEffect(() => {
    if (key === "") return;
    let live = true;
    fetch(`/api/terms/${term}/courses?numbers=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (live && data) setSaved(data.courses); })
      .catch(() => {});
    return () => { live = false; };
  }, [term, key]);

  // Debounced: people type "cmpt 225" a character at a time.
  const q = query.trim();
  const searchable = q.length >= 2;

  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/terms/${term}/courses?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (live) setHits({ q, courses: data?.courses ?? [] }); })
        .catch(() => { if (live) setHits({ q, courses: [] }); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [term, q, searchable]);

  async function add(classNumber: string) {
    setBusy(classNumber);
    const res = await fetch(`/api/groups/${groupCode}/members/${memberId}/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classNumber }),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "could not add that section");
      return;
    }
    setError(null);
    onChange();
  }

  async function remove(classNumber: string) {
    setBusy(classNumber);
    const res = await fetch(
      `/api/groups/${groupCode}/members/${memberId}/courses?classNumber=${classNumber}`,
      { method: "DELETE" }
    );
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "could not remove that section");
      return;
    }
    setError(null);
    onChange();
  }

  const searching = hits.q !== q;
  const shownResults = searching ? [] : hits.courses;

  /**
   * The section Enter would add: the only one on screen, and not already in.
   *
   * "Exactly one" is counted across sections, not courses — a search that
   * turns up one course with a lecture and two tutorials is three answers, and
   * picking one of them for you would be a guess. Null the rest of the time,
   * which is also what hides the hint under the box.
   */
  const flat = shownResults.flatMap((c) =>
    c.sections.map((s) => ({ course: courseCode(c), section: s }))
  );
  const only = flat.length === 1 && !savedSet.has(flat[0].section.classNumber) ? flat[0] : null;

  /**
   * Enter adds the one section on screen.
   *
   * People type a code they already know and hit Enter in the same breath,
   * well inside the 250ms debounce, so the keystroke usually lands before any
   * results do. Rather than drop it — which would make the shortcut feel
   * broken at exactly the speed it's meant for — Enter runs the search itself
   * and skips whatever is left of the debounce. Should the debounced fetch
   * land too it carries the same answer for the same query.
   *
   * Enter never removes. Taking a section out on a keystroke is not a thing to
   * do by accident, so an already-added match is left alone.
   */
  async function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !searchable) return;
    e.preventDefault();
    if (only) { add(only.section.classNumber); return; }
    // Results are in and they're ambiguous, or empty. Nothing Enter can mean.
    if (!searching) return;

    const pending = q;
    const res = await fetch(`/api/terms/${term}/courses?q=${encodeURIComponent(pending)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const courses: CourseHit[] = res?.courses ?? [];
    setHits({ q: pending, courses });

    const matches = courses.flatMap((c) => c.sections);
    if (matches.length === 1 && !savedSet.has(matches[0].classNumber)) {
      add(matches[0].classNumber);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-neutral-500">Your courses</p>
      {key === "" ? (
        <p className="text-xs text-neutral-500">Nothing saved yet — add your sections below.</p>
      ) : saved.length === 0 ? (
        <p className="text-xs text-neutral-500">Loading your sections…</p>
      ) : null}
      {key !== "" && saved.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {saved.map((c) =>
            c.sections.map((s) => (
              <li key={s.classNumber}>
                <button
                  onClick={() => remove(s.classNumber)}
                  disabled={busy === s.classNumber}
                  title={`${courseCode(c)} ${s.section} — ${meetingLabel(s)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2 py-1 text-xs transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-50 dark:border-neutral-700"
                >
                  <span className="font-medium">{courseCode(c)}</span>
                  <span className="text-neutral-500">{s.section}</span>
                  <span aria-hidden>×</span>
                  <span className="sr-only">remove</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <p className="mt-1 text-xs font-medium text-neutral-500">Search SFU courses</p>
      {/* Typing searches. Enter adds, but only when the results leave no room
          for doubt — a query like "cmpt 225" matches a lecture and its
          tutorials, and there is no way to tell which of them you're in. */}
      <div className="relative">
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13.2 13.2L17 17" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="CMPT 225, MATH 151, calculus…"
          className="w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      {/* Only when there is one answer, so the line is never a promise the
          keystroke won't keep. */}
      {only && (
        <p className="text-xs text-neutral-500">
          Press <kbd className="rounded border border-neutral-300 px-1 font-sans text-[10px] dark:border-neutral-700">Enter</kbd>{" "}
          to add <span className="font-medium text-neutral-700 dark:text-neutral-300">{only.course} {only.section.section}</span>
        </p>
      )}

      {searchable && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          {shownResults.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500">
              {searching ? "Searching…" : "Nothing matches that this term."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {shownResults.map((c) => (
                <li key={`${c.dept}${c.number}`} className="px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{courseCode(c)}</span>
                    <span className="truncate text-xs text-neutral-500">{c.title}</span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {c.sections.map((s) => {
                      const on = savedSet.has(s.classNumber);
                      return (
                        <li
                          key={s.classNumber}
                          // On the row, not just the button: the times are what
                          // you're reading when you want to see where it lands.
                          onMouseEnter={() => onPreview?.({ course: courseCode(c), section: s })}
                          onMouseLeave={() => onPreview?.(null)}
                          onFocus={() => onPreview?.({ course: courseCode(c), section: s })}
                          onBlur={() => onPreview?.(null)}
                          className="flex flex-wrap items-center gap-2 text-xs"
                        >
                          <button
                            onClick={() => { onPreview?.(null); return on ? remove(s.classNumber) : add(s.classNumber); }}
                            disabled={busy === s.classNumber}
                            className={`flex w-16 shrink-0 items-center justify-center rounded-lg border px-2 py-1 font-medium transition-colors disabled:opacity-50 ${
                              on
                                ? "border-neutral-300 text-neutral-500 hover:border-red-400 hover:text-red-600 dark:border-neutral-700"
                                : "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                            }`}
                          >
                            {/* The round trip writes to the term schedule and
                                then reloads the whole group, so it is long
                                enough to look like a click that missed. The
                                button keeps its width, so nothing reflows. */}
                            {busy === s.classNumber ? (
                              <Spinner />
                            ) : on ? (
                              "Added"
                            ) : (
                              "Add"
                            )}
                          </button>
                          <span className="font-medium">{s.section}</span>
                          <span className="text-neutral-500">{meetingLabel(s)}</span>
                          {s.instructor && (
                            <span className="truncate text-neutral-500">{s.instructor}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-xs text-amber-600">{error}</p>}
    </div>
  );
}
