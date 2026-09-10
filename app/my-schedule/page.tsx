import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthButton } from "@/components/AuthButton";
import { listMembershipsForUser } from "@/lib/groups";

export default async function MySchedulePage() {
  const session = await auth();

  if (session?.appUserId) {
    const memberships = await listMembershipsForUser(session.appUserId);
    const latest = memberships[0];
    if (latest) redirect(`/g/${latest.group.code}?view=mine`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
      {session?.appUserId ? (
        <>
          <p className="text-sm text-neutral-500">
            You haven&apos;t joined a group yet. Join one and add your courses to see your schedule here.
            If your schedule is already in a group, open its link and claim your name.
          </p>
          <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            Create or join a group
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-500">Sign in to see your saved schedule.</p>
          <div><AuthButton /></div>
        </>
      )}
    </main>
  );
}
