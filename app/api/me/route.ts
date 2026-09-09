import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMembershipsForUser } from "@/lib/groups";
import { MAX_AVATAR_CHARS, getUser, isValidAvatar, setAvatar } from "@/lib/users";

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

/**
 * Change the picture. `avatar` is a data URL the browser produced by
 * downscaling the chosen file; `null` drops back to the Google one.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!("avatar" in body)) {
    return NextResponse.json({ error: "avatar is required" }, { status: 400 });
  }

  const { avatar } = body;
  if (avatar !== null && !isValidAvatar(avatar)) {
    return NextResponse.json(
      {
        error:
          typeof avatar === "string" && avatar.length > MAX_AVATAR_CHARS
            ? "that picture is too big"
            : "that isn't an image we can store",
      },
      { status: 400 }
    );
  }

  await setAvatar(session.appUserId, avatar);
  return NextResponse.json({ avatar });
}
