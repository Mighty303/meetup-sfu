import { NextResponse } from "next/server";
import { timetableCalendar } from "@/lib/calendar";
import { findGroup, getMemberCourses } from "@/lib/groups";
import { authorizeMember } from "@/lib/member-access";
import { getTermSections } from "@/lib/sections";
import { indexByClassNumber } from "@/lib/sfu";

/** Safe for a Content-Disposition filename on every platform. */
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "schedule"
  );
}

/**
 * Your own timetable for this group's term, as a file.
 *
 * `attachment` rather than inline: a browser handed `text/calendar` inline will
 * happily render it as text, which is not what anyone clicking "export" wants.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorizeMember(code, memberId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const [courses, classNumbers] = await Promise.all([
    getTermSections(group.term),
    getMemberCourses(access.id),
  ]);

  const ics = timetableCalendar({
    index: indexByClassNumber(courses),
    classNumbers,
    groupName: group.name,
    term: group.term,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(group.name)}-timetable.ics"`,
      // Someone's timetable is not something a CDN should be holding onto.
      "Cache-Control": "no-store",
    },
  });
}
