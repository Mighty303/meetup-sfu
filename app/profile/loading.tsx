import { ProfileBodySkeleton } from "@/components/Skeleton";

/**
 * The same body the page shows while its own fetch is in flight, hoisted to
 * the route so the heading and the shape arrive on the click rather than after
 * the segment's JavaScript has loaded.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
      <ProfileBodySkeleton />
    </main>
  );
}
