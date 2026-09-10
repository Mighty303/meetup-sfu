"use client";

interface Props {
  groupCode: string;
  /** Null when you're not in this group: there's no timetable of yours to take. */
  memberId: number | null;
  /** Monday of the week on screen — the free-window export follows the grid. */
  week: string | null;
}

/**
 * Getting a schedule out to the calendar somebody already lives in.
 *
 * Both are plain links, not fetches: the routes send
 * `Content-Disposition: attachment`, so the browser saves the file itself and
 * there is no blob to build or revoke.
 */
export function CalendarTools({ groupCode, memberId, week }: Props) {
  const timetableHref = `/api/groups/${groupCode}/members/${memberId}/calendar`;
  const windowsHref =
    `/api/groups/${groupCode}/calendar` + (week ? `?week=${week}` : "");

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <span className="text-neutral-500">Export</span>
      {memberId !== null && (
        <a
          href={timetableHref}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          My timetable (.ics)
        </a>
      )}
      <a
        href={windowsHref}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        This week&apos;s free windows (.ics)
      </a>
    </div>
  );
}
