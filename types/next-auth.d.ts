declare module "next-auth" {
  interface Session {
    /**
     * Our meetup.users row id. Deliberately not Session.user.id — that field
     * already exists as a string (Google's subject) and this is our own serial.
     */
    appUserId?: number;
    /** Only gates the nav link; every admin surface re-checks server-side. */
    isAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: number;
    /** The picture they chose, if any. Null once they've reverted to Google's. */
    avatar?: string | null;
    /**
     * Which door they came in by. Only the Google one carries a verified
     * address, and the admin allowlist is an address list — see lib/admin.ts.
     */
    hasGoogle?: boolean;
  }
}

export {};
