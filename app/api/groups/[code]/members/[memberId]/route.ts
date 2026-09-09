import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  canEditMember,
  findGroup,
  removeMember,
  renameMember,
  setMemberCourses,
} from "@/lib/groups";
import { parseScheduleInput } from "@/lib/sfu";

/**
 * Resolves the member and checks the caller may edit it. Owned rows require
 * their owner; rows without an owner predate sign-in and stay open to anyone
 * with the invite code.
 */
async function authorize(code: string, memberId: string) {
  const group = await findGroup(code.toUpperCase());
  if (!group) return { error: "group not found", status: 404 as const };

  const id = Number(memberId);
  if (!Number.isInteger(id)) {
    return { error: "member not in this group", status: 404 as const };
  }

  const session = await auth();
  const allowed = await canEditMember(id, group.id, session?.appUserId ?? null);
  if (!allowed) {
    return { error: "that's not your schedule to edit", status: 403 as const };
  }
  return { id };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorize(code, memberId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const { input } = await req.json().catch(() => ({}));
  if (typeof input !== "string") {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }

  const classNumbers = parseScheduleInput(input);
  await setMemberCourses(access.id, classNumbers);
  return NextResponse.json({ classNumbers });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorize(code, memberId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const { displayName } = await req.json().catch(() => ({}));
  if (typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  try {
    await renameMember(access.id, displayName.trim().slice(0, 60));
  } catch (err) {
    if (String(err).includes("duplicate key")) {
      return NextResponse.json({ error: "that name is taken in this group" }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ displayName: displayName.trim().slice(0, 60) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorize(code, memberId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  await removeMember(access.id);
  return new NextResponse(null, { status: 204 });
}
