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
