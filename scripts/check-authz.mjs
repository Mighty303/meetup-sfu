// Verifies who may edit a member row. Runs against the real database and
// cleans up after itself.
import assert from "node:assert/strict";
import { envValue } from "./env.mjs";
import { neon } from "@neondatabase/serverless";

const sql = neon(envValue("DATABASE_URL"));

// Mirrors lib/groups.ts canEditMember — kept in sync deliberately so this
// script can run without a bundler.
async function canEdit(memberId, groupId, appUserId) {
  const rows = await sql`
    SELECT user_id FROM meetup.members WHERE id = ${memberId} AND group_id = ${groupId}
  `;
  if (rows.length === 0) return false;
  const owner = rows[0].user_id;
  return owner === null || owner === appUserId;
}

const [group] = await sql`
  INSERT INTO meetup.groups (code, name, term) VALUES ('ZZTEST1', 'authz test', '2025-fall')
  RETURNING id
`;
const [alice] = await sql`
  INSERT INTO meetup.users (google_sub, email, name) VALUES ('sub-alice', 'a@x.com', 'Alice') RETURNING id
`;
const [bob] = await sql`
  INSERT INTO meetup.users (google_sub, email, name) VALUES ('sub-bob', 'b@x.com', 'Bob') RETURNING id
`;
const [owned] = await sql`
  INSERT INTO meetup.members (group_id, display_name, color, user_id)
  VALUES (${group.id}, 'Alice', '#ef4444', ${alice.id}) RETURNING id
`;
const [legacy] = await sql`
  INSERT INTO meetup.members (group_id, display_name, color, user_id)
  VALUES (${group.id}, 'Legacy', '#f97316', NULL) RETURNING id
`;

assert.equal(await canEdit(owned.id, group.id, alice.id), true, "owner can edit their own row");
assert.equal(await canEdit(owned.id, group.id, bob.id), false, "another user cannot edit it");
assert.equal(await canEdit(owned.id, group.id, null), false, "anonymous cannot edit an owned row");
assert.equal(await canEdit(legacy.id, group.id, null), true, "pre-auth row stays editable");
assert.equal(await canEdit(legacy.id, group.id, bob.id), true, "pre-auth row editable by anyone");
assert.equal(await canEdit(owned.id, 999999, alice.id), false, "member from another group is rejected");
assert.equal(await canEdit(999999, group.id, alice.id), false, "missing member is rejected");

// One member row per user per group.
await assert.rejects(
  () => sql`INSERT INTO meetup.members (group_id, display_name, color, user_id)
            VALUES (${group.id}, 'Alice again', '#eab308', ${alice.id})`,
  /duplicate key/,
  "the partial unique index blocks a second row for the same user"
);
// ...but multiple ownerless rows are still allowed.
await sql`INSERT INTO meetup.members (group_id, display_name, color, user_id)
          VALUES (${group.id}, 'Legacy 2', '#22c55e', NULL)`;

await sql`DELETE FROM meetup.groups WHERE id = ${group.id}`;
await sql`DELETE FROM meetup.users WHERE id IN (${alice.id}, ${bob.id})`;

const leftover = await sql`SELECT COUNT(*)::int AS n FROM meetup.members WHERE group_id = ${group.id}`;
assert.equal(leftover[0].n, 0, "deleting the group cascades to members");

console.log("ALL AUTHZ CHECKS PASSED");

// --- claim flow -------------------------------------------------------------
async function claim(memberId, groupId, userId) {
  const existing = await sql`
    SELECT id FROM meetup.members WHERE group_id = ${groupId} AND user_id = ${userId}
  `;
  if (existing.length > 0) return "already-member";
  const rows = await sql`
    UPDATE meetup.members SET user_id = ${userId}
    WHERE id = ${memberId} AND group_id = ${groupId} AND user_id IS NULL
    RETURNING id
  `;
  return rows.length > 0 ? "ok" : "not-claimable";
}

const [g2] = await sql`
  INSERT INTO meetup.groups (code, name, term) VALUES ('ZZTEST2', 'claim test', '2025-fall') RETURNING id
`;
const [carol] = await sql`
  INSERT INTO meetup.users (google_sub, email, name) VALUES ('sub-carol', 'c@x.com', 'Carol') RETURNING id
`;
const [dave] = await sql`
  INSERT INTO meetup.users (google_sub, email, name) VALUES ('sub-dave', 'd@x.com', 'Dave') RETURNING id
`;
const [orphan] = await sql`
  INSERT INTO meetup.members (group_id, display_name, color, user_id)
  VALUES (${g2.id}, 'Legacy Martin', '#ef4444', NULL) RETURNING id
`;
await sql`INSERT INTO meetup.member_courses (member_id, class_number) VALUES (${orphan.id}, '6023')`;

assert.equal(await claim(orphan.id, g2.id, carol.id), "ok", "an ownerless row can be claimed");
assert.equal(await claim(orphan.id, g2.id, dave.id), "not-claimable", "a claimed row can't be re-claimed");
assert.equal(await claim(orphan.id, g2.id, carol.id), "already-member", "claiming twice is refused");

// The whole point: the claimed row keeps its saved schedule.
const kept = await sql`SELECT class_number FROM meetup.member_courses WHERE member_id = ${orphan.id}`;
assert.deepEqual(kept.map((r) => r.class_number), ["6023"], "claiming preserves saved courses");
assert.equal(await canEdit(orphan.id, g2.id, carol.id), true, "claimer can now edit");
assert.equal(await canEdit(orphan.id, g2.id, null), false, "and anonymous no longer can");

await sql`DELETE FROM meetup.groups WHERE id = ${g2.id}`;
await sql`DELETE FROM meetup.users WHERE id IN (${carol.id}, ${dave.id})`;

console.log("ALL CLAIM CHECKS PASSED");
