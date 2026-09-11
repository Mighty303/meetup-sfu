import { GroupPageSkeleton } from "@/components/Skeleton";

/**
 * This route resolves your newest group and redirects into it, so the click
 * used to sit on the old page through a session read and a database query
 * before anything moved.
 *
 * The fallback is the group page's own skeleton rather than something shaped
 * like this route, because this route is never what you end up looking at —
 * the redirect lands on /g/<code>?view=mine, and that page's skeleton is
 * already the right picture of where you're going. Solo, for the same reason.
 */
export default function Loading() {
  return <GroupPageSkeleton solo />;
}
