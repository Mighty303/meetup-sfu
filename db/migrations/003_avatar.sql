-- A picture of your own, instead of whatever Google has.
--
-- Kept separate from users.image rather than overwriting it: every sign-in
-- upserts the Google picture, so an edit made in place would be undone the next
-- time you logged in. NULL here means "use Google's", which is also how you
-- undo a change.
--
-- The value is a small data URL, downscaled and re-encoded in the browser
-- before it's sent. That's a few KB of text, and it saves standing up a blob
-- store and a signed-upload path for what is at most one image per person.
ALTER TABLE meetup.users
  ADD COLUMN IF NOT EXISTS avatar TEXT;
