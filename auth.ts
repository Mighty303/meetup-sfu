import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdminEmail } from "@/lib/admin";
import { getUser, upsertUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // Vercel serves this under a few hostnames (alias + per-deployment URLs).
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    // Runs only on sign-in, when `profile` is present. We keep our own users
    // row and carry its id on the token, so no database adapter is needed.
    async jwt({ token, profile, trigger }) {
      if (profile?.sub) {
        const user = await upsertUser({
          googleSub: profile.sub,
          email: profile.email ?? "",
          name: profile.name ?? null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.appUserId = user.id;
        token.avatar = user.avatar;
      } else if (trigger === "update" && typeof token.appUserId === "number") {
        // The client asks for this after changing its picture. Re-reading here
        // rather than on every session lookup keeps the common path free of a
        // database round trip.
        token.avatar = (await getUser(token.appUserId))?.avatar ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.appUserId === "number") {
        session.appUserId = token.appUserId;
      }
      // Computed here rather than stamped on the token at sign-in, so adding an
      // address to the allowlist takes effect without everyone signing out
      // again. It only decides whether the nav shows the link — the portal
      // itself re-checks against the database.
      session.isAdmin = isAdminEmail(token.email);
      // A chosen picture wins over Google's everywhere the session is read.
      if (session.user && typeof token.avatar === "string") {
        session.user.image = token.avatar;
      }
      return session;
    },
  },
});
