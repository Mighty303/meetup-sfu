import { NextResponse } from "next/server";
import { coursesForClassNumbers, searchTermCourses } from "@/lib/sections";

/**
 * Course lookup for the picker. `?q=` searches, `?numbers=` resolves saved
 * class numbers into course codes. Both filter inside Postgres, so neither the
 * 1.7 MB term dump nor anything close to it crosses a wire.
 *
 * The answers are public course data and change at most once a day, so they're
 * cached at the edge: a second person typing "cmpt 225" never reaches the
 * database at all.
 */
function cached(body: unknown, seconds: number): NextResponse {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=604800`,
    },
  });
}

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

  try {
    if (numbers !== null) {
      const wanted = numbers.split(",").map((n) => n.trim()).filter(Boolean).slice(0, 60);
      // An hour: saved sections resolve to the same codes all day, but a member
      // editing their list should not see a stale chip for long.
      return cached({ courses: await coursesForClassNumbers(term, wanted) }, 3600);
    }

    return cached({ courses: await searchTermCourses(term, q.get("q") ?? "") }, 86400);
  } catch {
    return NextResponse.json({ error: "course data is unavailable" }, { status: 502 });
  }
}
