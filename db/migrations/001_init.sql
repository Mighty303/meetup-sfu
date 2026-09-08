-- meetup-sfu v0: shared free-time finder.
-- Lives in its own schema so it never collides with the tutoring app's tables.

CREATE SCHEMA IF NOT EXISTS meetup;

CREATE TABLE IF NOT EXISTS meetup.groups (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(12) UNIQUE NOT NULL,   -- invite code, the only access control in v0
  name       VARCHAR(120) NOT NULL,
  term       VARCHAR(20) NOT NULL,          -- '2025-fall', matches the sfucourses API
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetup.members (
  id           SERIAL PRIMARY KEY,
  group_id     INTEGER NOT NULL REFERENCES meetup.groups(id) ON DELETE CASCADE,
  display_name VARCHAR(60) NOT NULL,
  color        VARCHAR(7) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, display_name)
);

-- Only class numbers are stored; meeting times are always resolved from the API,
-- so a schedule change upstream is picked up without a migration.
CREATE TABLE IF NOT EXISTS meetup.member_courses (
  member_id    INTEGER NOT NULL REFERENCES meetup.members(id) ON DELETE CASCADE,
  class_number VARCHAR(10) NOT NULL,
  PRIMARY KEY (member_id, class_number)
);

-- Non-course busy time: work shifts, commute, gym.
CREATE TABLE IF NOT EXISTS meetup.member_blocks (
  id        SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES meetup.members(id) ON DELETE CASCADE,
  day       CHAR(2) NOT NULL,              -- Mo Tu We Th Fr Sa Su
  start_min SMALLINT NOT NULL,             -- minutes since midnight
  end_min   SMALLINT NOT NULL,
  label     VARCHAR(60) NOT NULL DEFAULT 'Busy',
  CHECK (end_min > start_min)
);

-- One term dump is ~1900 courses; cache it so every group member shares one fetch.
CREATE TABLE IF NOT EXISTS meetup.sections_cache (
  term       VARCHAR(20) PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetup_members_group ON meetup.members(group_id);
CREATE INDEX IF NOT EXISTS idx_meetup_blocks_member ON meetup.member_blocks(member_id);
