import { NextResponse } from "next/server";
import { createGroup } from "@/lib/groups";
import { currentTermCode } from "@/lib/sfu";

export async function POST(req: Request) {
  const { name, term } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const group = await createGroup(
    name.trim().slice(0, 120),
    typeof term === "string" && /^\d{4}-(spring|summer|fall)$/.test(term)
      ? term
      : currentTermCode()
  );
  return NextResponse.json(group, { status: 201 });
}
