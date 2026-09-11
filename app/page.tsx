import { auth } from "@/auth";
import { GroupsHome } from "@/components/GroupsHome";
import { LandingHome } from "@/components/LandingHome";

/**
 * Two different pages behind one URL: an introduction for someone who hasn't
 * signed in, and their own groups for someone who has.
 *
 * The branch is made here, on the server, rather than from useSession in the
 * browser. SessionProvider is given no session to start from, so the client
 * hook always begins at "loading" — branching on it would show every returning
 * user the pitch and the demo for a beat before swapping them for their own
 * groups, which is the flash most worth avoiding.
 *
 * The cost is that "/" reads cookies and is no longer static. app/loading.tsx
 * covers the navigation, and the layout above is still entirely static, which
 * is what lets that fallback paint at all.
 */
export default async function Home() {
  const session = await auth();
  return session?.appUserId ? <GroupsHome /> : <LandingHome />;
}
