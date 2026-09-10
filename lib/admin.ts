import { getDb } from "./db";

/**
 * Who may open the admin portal. Configuration only — deliberately no default.
 *
 * This repository is public, so a baked-in address would become the allowlist
 * of every deployment cloned from it, handing whoever is named here admin over
 * a stranger's data. Unset means nobody is an admin, which is the right way for
 * a gate to fail.
 *
 * Comparison is lowercase; Google returns the address as registered.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Optional second lock. An email is only as good as the identity provider
 * behind it; Google's `sub` is the account itself and can never be reassigned.
 * Set ADMIN_GOOGLE_SUB once you know yours (the portal prints it) and the
 * address alone stops being enough.
 */
const ADMIN_GOOGLE_SUB = process.env.ADMIN_GOOGLE_SUB?.trim() || null;

export interface AdminIdentity {
  userId: number;
  email: string;
  name: string | null;
  /** Shown in the portal so it can be pasted into ADMIN_GOOGLE_SUB. */
  googleSub: string;
  /** True when ADMIN_GOOGLE_SUB is set and matched, not merely when set. */
  subPinned: boolean;
}

/**
 * The admin behind a session's user id, or null for everyone else.
 *
 * Nothing here trusts the client. The id arrives on a JWT signed with
 * AUTH_SECRET, and the email it resolves to is read from our own users row,
 * which is only ever written from Google's verified profile at sign-in. So a
 * spoof needs both the signing secret and the Google account.
 *
 * The session is passed in rather than read here, so this module never imports
 * auth.ts — auth.ts imports the allowlist below for the nav flag.
 */
export async function adminFor(appUserId: number | null | undefined): Promise<AdminIdentity | null> {
  if (!appUserId) return null;

  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, google_sub FROM meetup.users WHERE id = ${appUserId}
  `;
  const row = rows[0];
  if (!row) return null;

  const email = String(row.email ?? "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return null;
  if (ADMIN_GOOGLE_SUB && row.google_sub !== ADMIN_GOOGLE_SUB) return null;

  return {
    userId: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    googleSub: row.google_sub as string,
    subPinned: ADMIN_GOOGLE_SUB !== null,
  };
}

/** For the nav link only — pages and routes still gate on adminFor(). */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
