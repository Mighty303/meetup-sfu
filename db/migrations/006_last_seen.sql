-- When each person was last actually here.
--
-- The admin page has been reporting users.updated_at as "last sign-in", and
-- lib/metrics.ts says as much in a comment. That column moves when upsertUser
-- writes a row — on sign-in, and when someone changes their picture — so for
-- anyone who stays signed in across a term it barely moves at all. Somebody who
-- opened the site this morning and somebody who opened it in September and
-- never came back can carry the same timestamp, which makes the one question
-- worth asking of this table — who is still using it — unanswerable.
--
-- So visiting gets its own column. updated_at keeps meaning "the row changed",
-- which is what it has always meant and what the avatar write still needs.
--
-- Deliberately NULL for every existing row rather than backfilled from
-- created_at or updated_at. Neither is a visit: created_at is when they first
-- signed in, updated_at is when a row last changed. Backfilling from either
-- would invent a history of visits nobody recorded, and the invented dates
-- would be indistinguishable from real ones for as long as the table lives.
-- NULL says the honest thing — not seen since we started counting — and every
-- row fills itself in the next time that person loads a page.
ALTER TABLE meetup.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- No index on purpose. The reads are an ORDER BY and a 7-day COUNT over the
-- whole users table, which is small enough that Postgres will sequential-scan
-- it whatever we build; the writes are by primary key and would have to
-- maintain the extra index on every visit. Worth revisiting if this table ever
-- reaches the tens of thousands, which for a group-scheduling app for one
-- campus it will not.
COMMENT ON COLUMN meetup.users.last_seen_at IS 'Last page view, throttled in lib/last-seen.ts so one visit costs one write. NULL means not seen since migration 006.';
