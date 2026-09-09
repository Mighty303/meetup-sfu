import { NextResponse } from "next/server";
import {
  isMemberColor,
  removeMember,
  renameMember,
  setMemberColor,
  setMemberCourses,
} from "@/lib/groups";
import { authorizeMember } from "@/lib/member-access";
import { parseScheduleInput } from "@/lib/sfu";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorizeMember(code, memberId);
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
  const access = await authorizeMember(code, memberId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json().catch(() => ({}));
  const wantsName = "displayName" in body;
  const wantsColor = "color" in body;
  if (!wantsName && !wantsColor) {
    return NextResponse.json(
      { error: "displayName or color is required" },
      { status: 400 }
    );
  }

  if (wantsColor && !isMemberColor(body.color)) {
    return NextResponse.json({ error: "not a colour we offer" }, { status: 400 });
  }

  let name: string | undefined;
  if (wantsName) {
    const raw: unknown = body.displayName;
    if (typeof raw !== "string" || !raw.trim()) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }
    name = raw.trim().slice(0, 60);
    try {
      await renameMember(access.id, name);
    } catch (err) {
      if (String(err).includes("duplicate key")) {
        return NextResponse.json({ error: "that name is taken in this group" }, { status: 409 });
      }
      throw err;
    }
  }

  // After the rename, so a failed name doesn't leave a half-applied edit behind.
  if (wantsColor) await setMemberColor(access.id, body.color);

  return NextResponse.json({
    ...(wantsName ? { displayName: name } : {}),
    ...(wantsColor ? { color: body.color } : {}),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const { code, memberId } = await params;
  const access = await authorizeMember(code, memberId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  await removeMember(access.id);
  return new NextResponse(null, { status: 204 });
}
