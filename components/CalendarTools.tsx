"use client";

import { useRef, useState } from "react";
import type { DayKey } from "@/lib/sfu";
import { formatTime } from "@/lib/sfu";

interface MatchedSection {
  classNumber: string;
  label: string;
}

interface ImportedSlot {
  day: DayKey;
  start: number;
  end: number;
  label: string;
  recurring: boolean;
}

interface ImportResponse {
  matched: MatchedSection[];
  custom: ImportedSlot[];
  /** How many custom blocks were genuinely new — a re-import adds nothing. */
  addedBlocks: number;
  skipped: {
    allDay: number;
    outsideTerm: number;
    unusable: number;
    unsupportedRecurrence: number;
  };
  blocks: { day: DayKey; start: number; end: number; label: string }[];
}

interface Props {
  groupCode: string;
  memberId: number;
  /** Monday of the week on screen — the free-window export follows the grid. */
  week: string | null;
  /** Called after an import lands so the page can refetch the grid. */
  onChange: () => void;
}

const DAY_LABELS: Record<string, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

/** Only worth a line when it's non-zero — a tally of zeros reads as noise. */
function skipNotes(skipped: ImportResponse["skipped"]): string[] {
  const notes: string[] = [];
  if (skipped.outsideTerm > 0) {
    notes.push(`${skipped.outsideTerm} outside this term`);
  }
  if (skipped.allDay > 0) {
    notes.push(`${skipped.allDay} all-day`);
  }
  if (skipped.unsupportedRecurrence > 0) {
    notes.push(`${skipped.unsupportedRecurrence} not weekly`);
  }
  if (skipped.unusable > 0) {
    notes.push(`${skipped.unusable} with no usable time`);
  }
  return notes;
}

/**
 * Getting a schedule out to a real calendar, and getting one in from one.
 *
 * The import summary is deliberately itemised. "Imported your calendar" is a
 * claim about somebody's week that they should be able to check line by line —
 * which sections were recognised, what came in as opaque busy time, and what
 * was left on the floor.
 */
export function CalendarTools({ groupCode, memberId, week, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [open, setOpen] = useState(false);

  const timetableHref = `/api/groups/${groupCode}/members/${memberId}/calendar`;
  const windowsHref =
    `/api/groups/${groupCode}/calendar` + (week ? `?week=${week}` : "");

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch(timetableHref, {
        method: "POST",
        headers: { "Content-Type": "text/calendar" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "could not read that calendar");
        return;
      }
      setResult(data as ImportResponse);
      onChange();
    } catch {
      setError("could not read that file");
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failed run.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function clearBlocks() {
    setBusy(true);
    await fetch(timetableHref, { method: "DELETE" });
    setBusy(false);
    setResult(null);
    onChange();
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-lg border border-neutral-200 dark:border-neutral-800"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
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
          className="shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
        >
          <path d="M4 2l4 4-4 4" />
        </svg>
        <span className="font-medium">Calendar</span>
        <span className="text-xs text-neutral-500">import or export .ics</span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Plain links: the routes send Content-Disposition: attachment, so
              the browser saves the file rather than rendering the text. */}
          <a
            href={timetableHref}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Export my timetable
          </a>
          <a
            href={windowsHref}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Export this week&apos;s free windows
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Reading…" : "Import a calendar"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <p className="text-xs text-neutral-500">
            An .ics from goSFU or Google Calendar. Read once and discarded —
            only the classes and busy times it resolves to are saved.
          </p>
        </div>

        {error && <p className="text-sm text-amber-600">{error}</p>}

        {result && (
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            {result.matched.length === 0 && result.custom.length === 0 ? (
              <p className="text-neutral-600 dark:text-neutral-300">
                Nothing in that file landed inside this term.
              </p>
            ) : (
              <>
                {result.matched.length > 0 && (
                  <div>
                    <p className="font-medium">
                      Recognised {result.matched.length} section
                      {result.matched.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                      {result.matched.map((m) => m.label).join(", ")}
                    </p>
                  </div>
                )}
                {result.custom.length > 0 && (
                  <div>
                    <p className="font-medium">
                      {result.addedBlocks} block
                      {result.addedBlocks === 1 ? "" : "s"} of busy time
                      {result.addedBlocks !== result.custom.length && (
                        <span className="font-normal text-neutral-500">
                          {" "}
                          ({result.custom.length - result.addedBlocks} already there)
                        </span>
                      )}
                    </p>
                    {/* Named, not counted: these aren't courses, so the only way
                        to tell whether the import got it right is to read them. */}
                    <ul className="mt-0.5 flex flex-col gap-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                      {result.custom.slice(0, 8).map((slot, i) => (
                        <li key={i}>
                          {DAY_LABELS[slot.day] ?? slot.day} {formatTime(slot.start)}–
                          {formatTime(slot.end)} · {slot.label}
                          {!slot.recurring && (
                            <span className="text-neutral-500"> · was a one-off, saved weekly</span>
                          )}
                        </li>
                      ))}
                      {result.custom.length > 8 && (
                        <li className="text-neutral-500">
                          +{result.custom.length - 8} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}

            {skipNotes(result.skipped).length > 0 && (
              <p className="text-xs text-neutral-500">
                Skipped: {skipNotes(result.skipped).join(", ")}.
              </p>
            )}

            {result.blocks.length > 0 && (
              <button
                onClick={clearBlocks}
                disabled={busy}
                className="self-start text-xs text-blue-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-blue-400"
              >
                Remove all {result.blocks.length} imported busy block
                {result.blocks.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
