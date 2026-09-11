-- Email and password sign-in, alongside Google.
--
-- The point is to be usable by someone who would rather not hand their
-- timetable to Google, so a password account is a first-class users row: same
-- id, same members, same schedule. Only the door differs.
--
-- Google's subject id becomes optional, because a password account has none.

ALTER TABLE meetup.users ALTER COLUMN google_sub DROP NOT NULL;

ALTER TABLE meetup.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Deliberately partial, and this is the security-relevant line in the file.
--
-- A password account's email is not verified — there is no mail infrastructure
-- here to verify it with — so it is a label, not an identity. Making the index
-- global would let anyone who registered first as someone@sfu.ca collide with
-- that person's real Google account, and whichever way we then resolved the
-- collision (link, or refuse) would be a way to interfere with an account you
-- do not own. Scoped to password rows, the two kinds of account simply never
-- meet: registering an address someone else uses at Google gets you your own
-- separate, empty account, which is the correct amount of nothing.
--
-- The cost is that one address can end up with two accounts. That is a real
-- wart, and the fix is linking from the profile page behind a password prompt,
-- not a constraint that decides it silently at sign-in.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetup_users_password_email
  ON meetup.users (LOWER(email))
  WHERE password_hash IS NOT NULL;

-- A row has to be reachable through one door or the other. Dropped first
-- because migrations here are re-run from the top and ADD CONSTRAINT has no
-- IF NOT EXISTS.
ALTER TABLE meetup.users DROP CONSTRAINT IF EXISTS users_has_credential;

ALTER TABLE meetup.users ADD CONSTRAINT users_has_credential
  CHECK (google_sub IS NOT NULL OR password_hash IS NOT NULL);
