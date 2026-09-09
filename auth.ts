import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // Vercel serves this under a few hostnames (alias + per-deployment URLs).
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    // Runs only on sign-in, when `profile` is present. We keep our own users
    // row and carry its id on the token, so no database adapter is needed.
    async jwt({ token, profile }) {
      if (profile?.sub) {
        const user = await upsertUser({
          googleSub: profile.sub,
          email: profile.email ?? "",
          name: profile.name ?? null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.appUserId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.appUserId === "number") {
        session.appUserId = token.appUserId;
      }
      return session;
    },
  },
});
