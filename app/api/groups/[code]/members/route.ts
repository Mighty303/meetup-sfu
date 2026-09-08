import { NextResponse } from "next/server";
import { addMember, findGroup } from "@/lib/groups";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const { displayName } = await req.json().catch(() => ({}));
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  try {
    const member = await addMember(group.id, displayName.trim().slice(0, 60));
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    // UNIQUE(group_id, display_name)
    if (String(err).includes("duplicate key")) {
      return NextResponse.json({ error: "that name is taken in this group" }, { status: 409 });
    }
    throw err;
  }
}
