import { getDb } from "./db";

export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  image: string | null;
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
    RETURNING id, email, name, image
  `;
  return rows[0] as AppUser;
}

export async function getUser(id: number): Promise<AppUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, image FROM meetup.users WHERE id = ${id}
  `;
  return (rows[0] as AppUser) ?? null;
}
