import { NextResponse } from "next/server";
import { getTermSections } from "@/lib/sections";
import { coursesByClassNumbers, searchCourses } from "@/lib/sfu";

/**
 * Course lookup for the picker. `?q=` searches, `?numbers=` resolves saved
 * class numbers into course codes. Both read the shared term cache, so the
 * 1.5 MB term dump stays on the server and the browser gets a handful of rows.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ term: string }> }
) {
  const { term } = await params;
  if (!/^\d{4}-(spring|summer|fall)$/.test(term)) {
    return NextResponse.json({ error: "bad term" }, { status: 400 });
  }

  const q = new URL(req.url).searchParams;
  const numbers = q.get("numbers");

  let courses;
  try {
    courses = await getTermSections(term);
  } catch {
    return NextResponse.json({ error: "course data is unavailable" }, { status: 502 });
  }

  if (numbers !== null) {
    const wanted = numbers.split(",").map((n) => n.trim()).filter(Boolean).slice(0, 60);
    return NextResponse.json({ courses: coursesByClassNumbers(courses, wanted) });
  }

  return NextResponse.json({ courses: searchCourses(courses, q.get("q") ?? "") });
}
