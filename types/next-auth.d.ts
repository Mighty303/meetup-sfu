declare module "next-auth" {
  interface Session {
    /**
     * Our meetup.users row id. Deliberately not Session.user.id — that field
     * already exists as a string (Google's subject) and this is our own serial.
     */
    appUserId?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: number;
    /** The picture they chose, if any. Null once they've reverted to Google's. */
    avatar?: string | null;
  }
}

export {};
