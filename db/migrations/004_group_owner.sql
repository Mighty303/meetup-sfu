-- Every group gets an admin: whoever created it.
--
-- Kept on the group rather than a flag on the member row, so the owner survives
-- their member row being deleted and can't be granted by editing a member.
-- ON DELETE SET NULL, not CASCADE: losing the user must not take the group and
-- everyone else's schedules with it.
ALTER TABLE meetup.groups
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES meetup.users(id) ON DELETE SET NULL;

-- Groups that predate this column: the earliest signed-in member is the closest
-- thing to a creator we can recover, since that's the row creation makes first.
UPDATE meetup.groups g
SET owner_user_id = (
  SELECT m.user_id FROM meetup.members m
  WHERE m.group_id = g.id AND m.user_id IS NOT NULL
  ORDER BY m.id
  LIMIT 1
)
WHERE g.owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetup_groups_owner ON meetup.groups(owner_user_id);
