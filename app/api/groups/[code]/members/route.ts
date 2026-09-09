import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addMember, findGroup, findMemberForUser } from "@/lib/groups";
import { getUser } from "@/lib/users";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in to join" }, { status: 401 });
  }

  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const existing = await findMemberForUser(group.id, session.appUserId);
  if (existing !== null) {
    return NextResponse.json({ error: "you're already in this group" }, { status: 409 });
  }

  // Default to the Google name; the member can rename themselves afterwards.
  const body = await req.json().catch(() => ({}));
  const user = await getUser(session.appUserId);
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim().slice(0, 60)
      : (user?.name ?? user?.email ?? "Member").slice(0, 60);

  try {
    const member = await addMember(group.id, displayName, session.appUserId);
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    if (String(err).includes("duplicate key")) {
      return NextResponse.json({ error: "that name is taken in this group" }, { status: 409 });
    }
    throw err;
  }
}
