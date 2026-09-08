import { NextResponse } from "next/server";
import { findGroup, memberBelongsToGroup, removeMember, setMemberCourses } from "@/lib/groups";
import { parseScheduleInput } from "@/lib/sfu";

async function authorize(code: string, memberId: string) {
  const group = await findGroup(code.toUpperCase());
  if (!group) return { error: "group not found", status: 404 as const };
  const id = Number(memberId);
  if (!Number.isInteger(id) || !(await memberBelongsToGroup(id, group.id))) {
    return { error: "member not in this group", status: 404 as const };
  }
  return { id };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const auth = await authorize(code, memberId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { input } = await req.json().catch(() => ({}));
  if (typeof input !== "string") {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }

  const classNumbers = parseScheduleInput(input);
  await setMemberCourses(auth.id, classNumbers);
  return NextResponse.json({ classNumbers });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const auth = await authorize(code, memberId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await removeMember(auth.id);
  return new NextResponse(null, { status: 204 });
}
