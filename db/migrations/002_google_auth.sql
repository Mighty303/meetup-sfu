-- Google sign-in. Members become owned rows: the signed-in user is the only one
-- who can edit their schedule and name.

CREATE TABLE IF NOT EXISTS meetup.users (
  id         SERIAL PRIMARY KEY,
  google_sub VARCHAR(255) UNIQUE NOT NULL,  -- Google's stable subject id, not the email
  email      VARCHAR(255) NOT NULL,
  name       VARCHAR(120),
  image      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nullable: members created before sign-in existed keep working, and stay
-- editable by anyone holding the invite code (that's how they were made).
ALTER TABLE meetup.members
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES meetup.users(id) ON DELETE CASCADE;

-- A signed-in user gets at most one member row per group.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetup_members_group_user
  ON meetup.members(group_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetup_members_user ON meetup.members(user_id);
