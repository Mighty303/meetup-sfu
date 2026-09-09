import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMembershipsForUser } from "@/lib/groups";
import { getUser } from "@/lib/users";

/** Everything the profile page needs: the Google identity plus every group row. */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const [user, memberships] = await Promise.all([
    getUser(session.appUserId),
    listMembershipsForUser(session.appUserId),
  ]);
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  return NextResponse.json({ user, memberships });
}
