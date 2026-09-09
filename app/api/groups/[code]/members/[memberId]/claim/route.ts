import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimMember, findGroup } from "@/lib/groups";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const { code, memberId } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const id = Number(memberId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }

  const result = await claimMember(id, group.id, session.appUserId);
  if (result === "already-member") {
    return NextResponse.json({ error: "you're already in this group" }, { status: 409 });
  }
  if (result === "not-claimable") {
    return NextResponse.json(
      { error: "that spot is already taken by someone else" },
      { status: 409 }
    );
  }
  return NextResponse.json({ memberId: id });
}
