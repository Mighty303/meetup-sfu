"use client";

interface Props {
  groupCode: string;
  /** Null when you're not in this group: there's no schedule of yours to take. */
  memberId: number | null;
}

/**
 * Taking your classes out to the calendar you already live in.
 *
 * A plain link, not a fetch: the route sends `Content-Disposition: attachment`,
 * so the browser saves the file itself and there is no blob to build or revoke.
 *
 * It sits in the week controls beside the view toggle, so the label has to stay
 * short — the arrow carries the "this downloads a file" half of the meaning
 * that "(.ics)" was carrying before.
 *
 * No week parameter: classes recur to the end of term, so this is the whole
 * term's timetable rather than whichever week happens to be on screen.
 */
export function CalendarTools({ groupCode, memberId }: Props) {
  if (memberId === null) return null;

  return (
    <a
      href={`/api/groups/${groupCode}/members/${memberId}/calendar`}
      title="Download your classes this term as an .ics calendar file"
      // shrink-0 and nowrap because this sits in a flex row that runs out of
      // room: without them the label broke across two lines and made the whole
      // control row taller than everything beside it.
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      <CalendarIcon />
      Export Calendar
      <DownloadIcon />
    </a>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-500 dark:text-neutral-400">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-400 dark:text-neutral-500">
      <path d="M10 3v9m0 0l3.5-3.5M10 12L6.5 8.5" />
      <path d="M3.5 14.5v1a2 2 0 002 2h9a2 2 0 002-2v-1" />
    </svg>
  );
}
