import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminFor } from "@/lib/admin";
import { getAdminMetrics } from "@/lib/metrics";

/**
 * The same numbers the portal renders, as JSON — for a spreadsheet, a chart, or
 * a script that watches the storage figure.
 *
 * Gated identically to the page, and deliberately 404 rather than 403 for a
 * signed-in non-admin: an admin-only route shouldn't confirm it exists.
 */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const admin = await adminFor(session.appUserId);
  if (!admin) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(await getAdminMetrics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
