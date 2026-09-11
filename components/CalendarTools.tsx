"use client";

interface Props {
  groupCode: string;
  /** Monday of the week on screen — the export follows the grid. */
  week: string | null;
}

/**
 * Taking the week's free windows out to the calendar somebody already lives in.
 *
 * A plain link, not a fetch: the route sends `Content-Disposition: attachment`,
 * so the browser saves the file itself and there is no blob to build or revoke.
 *
 * It sits in the week controls beside the view toggle, so the label has to stay
 * short — the arrow carries the "this downloads a file" half of the meaning
 * that "(.ics)" was carrying before.
 */
export function CalendarTools({ groupCode, week }: Props) {
  const href = `/api/groups/${groupCode}/calendar` + (week ? `?week=${week}` : "");

  return (
    <a
      href={href}
      title="Download this week's free windows as an .ics calendar file"
      className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      <CalendarIcon />
      Free windows
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
