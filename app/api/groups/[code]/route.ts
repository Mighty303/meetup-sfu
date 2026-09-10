import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteGroup, findGroup, getGroupState, isGroupOwner } from "@/lib/groups";
import { toMinutes } from "@/lib/sfu";

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
  const week = q.get("week") ? new Date(`${q.get("week")}T12:00:00`) : new Date();
  const state = await getGroupState(group, {
    week: Number.isNaN(week.getTime()) ? new Date() : week,
    dayStart: toMinutes(q.get("dayStart") ?? "08:00"),
    dayEnd: toMinutes(q.get("dayEnd") ?? "22:00"),
    minMinutes: Number(q.get("minMinutes") ?? 60),
  });
  return NextResponse.json(state);
}

/**
 * Deleting takes every member's schedule with it, so it's the group admin's
 * alone — the person who created it. Members leave; only the admin can end it.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const session = await auth();
  if (!(await isGroupOwner(group.id, session?.appUserId ?? null))) {
    return NextResponse.json(
      { error: "only the group admin can delete this group" },
      { status: 403 }
    );
  }

  await deleteGroup(group.id);
  return new NextResponse(null, { status: 204 });
}
