import { getDb } from "./db";

export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  /** Google's picture, refreshed on every sign-in. */
  image: string | null;
  /** A picture they chose instead. Null means Google's is the one to show. */
  avatar: string | null;
}

/** What to actually render for a user: their own picture, else Google's. */
export function avatarOf(user: { image: string | null; avatar: string | null }): string | null {
  return user.avatar ?? user.image;
}

/**
 * A data URL small enough to live in a row and safe enough to put in an <img>.
 * Only the three formats a canvas will encode, and only base64 — anything else
 * (an http URL, an SVG that could carry script) is refused.
 */
export const MAX_AVATAR_CHARS = 200_000;

export function isValidAvatar(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_AVATAR_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

/**
 * Keyed on Google's `sub`, not the email — an email can be reassigned within a
 * workspace, the subject id can't. Name and picture are refreshed on each
 * sign-in so a changed Google avatar follows through.
 */
export async function upsertUser(input: {
  googleSub: string;
  email: string;
  name: string | null;
  image: string | null;
}): Promise<AppUser> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meetup.users (google_sub, email, name, image)
    VALUES (${input.googleSub}, ${input.email}, ${input.name}, ${input.image})
    ON CONFLICT (google_sub) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          image = EXCLUDED.image,
          updated_at = NOW()
    RETURNING id, email, name, image, avatar
  `;
  return rows[0] as AppUser;
}

export async function getUser(id: number): Promise<AppUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, image, avatar FROM meetup.users WHERE id = ${id}
  `;
  return (rows[0] as AppUser) ?? null;
}

/** Pass null to drop back to the Google picture. */
export async function setAvatar(id: number, avatar: string | null): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE meetup.users
    SET avatar = ${avatar}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

/**
 * The password half of sign-in. Separate from upsertUser because the two doors
 * are deliberately separate rows — see 007_password_auth.sql for why an
 * unverified address is never allowed to meet a Google one.
 */

/** Trimmed and lowercased, which is how the partial unique index sees it. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately loose. Anything stricter rejects addresses that are perfectly
 * valid, and since nothing is mailed to this it is a label on the account
 * rather than a channel — the shape only has to rule out obvious typos.
 */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export interface PasswordUser extends AppUser {
  passwordHash: string | null;
}

/** Password accounts only — a Google row with the same address is not this one. */
export async function getPasswordUserByEmail(email: string): Promise<PasswordUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, image, avatar, password_hash
    FROM meetup.users
    WHERE LOWER(email) = ${normalizeEmail(email)} AND password_hash IS NOT NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    image: (row.image as string | null) ?? null,
    avatar: (row.avatar as string | null) ?? null,
    passwordHash: (row.password_hash as string | null) ?? null,
  };
}

/**
 * Null when the address is already a password account, so the caller can say so
 * without a second round trip. ON CONFLICT rather than a check-then-insert,
 * because two people registering the same address at once is exactly the race a
 * check-then-insert loses — the partial unique index is what actually decides.
 */
export async function createPasswordUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
}): Promise<AppUser | null> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meetup.users (email, name, password_hash)
    VALUES (${normalizeEmail(input.email)}, ${input.name}, ${input.passwordHash})
    ON CONFLICT (LOWER(email)) WHERE password_hash IS NOT NULL DO NOTHING
    RETURNING id, email, name, image, avatar
  `;
  return (rows[0] as AppUser) ?? null;
}
