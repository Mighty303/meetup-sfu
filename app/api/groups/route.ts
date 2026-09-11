import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addMember, createGroup, defaultMemberName } from "@/lib/groups";
import { currentTermCode } from "@/lib/sfu";

export async function POST(req: Request) {
  const { name, term } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  // Creating signed out still works; the group then has no admin until the
  // first member joins and adopts it.
  const session = await auth();
  const group = await createGroup(
    name.trim().slice(0, 120),
    typeof term === "string" && /^\d{4}-(spring|summer|fall)$/.test(term)
      ? term
      : currentTermCode(),
    session?.appUserId ?? null
  );

  // Starting a group is joining it. Without this the creator was pushed to
  // their own group and told they weren't in it, the group was missing from
  // "Your groups" until they pressed Join, and My Schedule claimed they hadn't
  // joined anything — while they were, the whole time, its admin.
  //
  // Not in the same transaction as the insert above, and it doesn't need to be:
  // the neon HTTP driver can't interleave JS inside one, and the failure this
  // would guard against — a group with no member row — is exactly the state
  // every group was in before, which the Join button still recovers from.
  if (session?.appUserId) {
    try {
      await addMember(group.id, await defaultMemberName(session.appUserId), session.appUserId);
    } catch {
      // The group exists and they own it; joining is recoverable from the page
      // itself, so a failure here isn't worth failing the creation over.
    }
  }

  return NextResponse.json(group, { status: 201 });
}
