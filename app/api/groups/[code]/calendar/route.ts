import { NextResponse } from "next/server";
import { windowsCalendar } from "@/lib/calendar";
import { findGroup, getGroupState } from "@/lib/groups";
import { toMinutes } from "@/lib/sfu";

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "group"
  );
}

/**
 * The week's free windows as a calendar file.
 *
 * No auth, matching the group state route this reads through: the invite code
 * is the credential, and this says nothing the group page doesn't already show
 * to anyone holding it.
 *
 * `gaps=1` narrows it to windows wedged between classes — the ones where
 * everybody is on campus anyway, which is usually the only set worth putting in
 * a calendar.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const q = new URL(req.url).searchParams;
  const requested = q.get("week") ? new Date(`${q.get("week")}T12:00:00`) : new Date();
  const state = await getGroupState(group, {
    week: Number.isNaN(requested.getTime()) ? new Date() : requested,
    dayStart: toMinutes(q.get("dayStart") ?? "08:00"),
    dayEnd: toMinutes(q.get("dayEnd") ?? "22:00"),
    minMinutes: Number(q.get("minMinutes") ?? 60),
  });

  const windows =
    q.get("gaps") === "1" ? state.free.filter((w) => w.betweenClasses) : state.free;

  const ics = windowsCalendar({
    windows,
    // Not the requested week: getGroupState clamps to one inside the term, and
    // the events have to sit on the days it actually computed.
    weekStart: state.week,
    groupName: group.name,
    term: group.term,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(group.name)}-free-${state.week}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
