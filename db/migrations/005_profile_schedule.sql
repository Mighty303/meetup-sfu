-- One schedule per person, shared by every group they're in.
--
-- Courses hung off the member row, and a member row is per (group, user), so
-- joining a second group meant picking every section again — the same timetable
-- typed twice, and thereafter drifting apart as only one copy got corrected.
-- Schedules belong to the person, so they move onto the user.
--
-- Keyed by term, not one flat list. A class number is only unique inside a
-- term: the API is fetched per term, and lib/metrics.ts already notes that a
-- class number "is only unique within a term, so the term comes along". A flat
-- list would not merely show a fall section in a spring group — it would
-- resolve that number against the spring catalogue and draw a *different*
-- course on the grid, silently and plausibly. Keyed by term, a group shows the
-- schedule you saved for its term and nothing else, and the shared-schedule win
-- lands where it's actually wanted: several groups in the term you're in now.
--
-- Ownerless member rows — the ones predating sign-in, editable by anyone with
-- the invite code — have no user to hang a schedule on, so they keep using
-- member_courses exactly as before. meetup.member_courses_effective below is
-- the one place that decides which of the two a member row reads from.

CREATE TABLE IF NOT EXISTS meetup.user_courses (
  user_id      INTEGER NOT NULL REFERENCES meetup.users(id) ON DELETE CASCADE,
  term         VARCHAR(20) NOT NULL,          -- '2025-fall', matches meetup.groups.term
  class_number VARCHAR(10) NOT NULL,
  -- Also the lookup index: the leading (user_id, term) is every read this table
  -- serves, so a second index would only be a copy.
  PRIMARY KEY (user_id, term, class_number)
);

-- Backfill: every owned member row's courses become that user's schedule for
-- the term of the group the row is in. Attributing by the group's term is not a
-- guess — it's the term the app already resolves those class numbers against,
-- so nothing lands in a term it wasn't already being read as.
--
-- A user in two groups in one term gets the union. Union rather than
-- most-recent-wins because the two lists are both things they told us they were
-- enrolled in, and the failure modes are not symmetric: an extra section is
-- visible on their own grid and removable in one click, while a dropped one is
-- invisible until someone schedules over a class they're sitting in.
--
-- Additive on purpose. member_courses is left untouched, so reverting the code
-- restores the previous behaviour with the old rows still in place. Once this
-- is proven, a follow-up can delete the rows where user_id IS NOT NULL.
INSERT INTO meetup.user_courses (user_id, term, class_number)
SELECT DISTINCT m.user_id, g.term, mc.class_number
FROM meetup.member_courses mc
JOIN meetup.members m ON m.id = mc.member_id
JOIN meetup.groups g ON g.id = m.group_id
WHERE m.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- What schedule a member row shows. Owned rows read the person's schedule for
-- the group's term; ownerless rows read their own courses, as they always have.
--
-- A view rather than the same LATERAL copied into getGroupState,
-- listMembershipsForUser and four admin queries: the rule about which table
-- wins is exactly the kind that rots when it exists in six places.
CREATE OR REPLACE VIEW meetup.member_courses_effective AS
SELECT m.id AS member_id,
       m.group_id,
       m.user_id,
       g.term,
       c.class_number
FROM meetup.members m
JOIN meetup.groups g ON g.id = m.group_id
JOIN LATERAL (
  SELECT uc.class_number
  FROM meetup.user_courses uc
  WHERE m.user_id IS NOT NULL
    AND uc.user_id = m.user_id
    AND uc.term = g.term
  UNION ALL
  SELECT mc.class_number
  FROM meetup.member_courses mc
  WHERE m.user_id IS NULL
    AND mc.member_id = m.id
) c ON TRUE;
