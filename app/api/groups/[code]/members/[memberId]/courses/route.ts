import { NextResponse } from "next/server";
import { addMemberCourse, getMemberCourses, removeMemberCourse } from "@/lib/groups";
import { authorizeMember } from "@/lib/member-access";

/** Class numbers are 3–6 digits; anything else never matches a section anyway. */
function readClassNumber(value: unknown): string | null {
  return typeof value === "string" && /^\d{3,6}$/.test(value.trim())
    ? value.trim()
    : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorizeMember(code, memberId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { classNumber } = await req.json().catch(() => ({}));
  const n = readClassNumber(classNumber);
  if (!n) return NextResponse.json({ error: "classNumber is required" }, { status: 400 });

  await addMemberCourse(access.id, n);
  return NextResponse.json({ classNumbers: await getMemberCourses(access.id) });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorizeMember(code, memberId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // In the query string, not a body — DELETE bodies aren't reliably forwarded.
  const n = readClassNumber(new URL(req.url).searchParams.get("classNumber"));
  if (!n) return NextResponse.json({ error: "classNumber is required" }, { status: 400 });

  await removeMemberCourse(access.id, n);
  return NextResponse.json({ classNumbers: await getMemberCourses(access.id) });
}
