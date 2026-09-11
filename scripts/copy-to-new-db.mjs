// One-off: copy the meetup schema's rows from the old Neon project into the new
// one. Source URL is read from the tutoring site's .env.local because both apps
// shared the old project; target is this repo's .env.local, which `neon deploy`
// already pointed at the new project.
//
// Safe to re-run: every insert is ON CONFLICT DO NOTHING and ids are preserved.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function urlFrom(file) {
  const m = readFileSync(file, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error(`no DATABASE_URL in ${file}`);
  return m[1];
}

const src = neon(urlFrom("/Users/martinwong/Tutor/lessons/tutor-website-next/.env.local"));
const dst = neon(urlFrom("/Users/martinwong/Desktop/CMPT/meetup-sfu/.env.local"));

// FK order. sections_cache is deliberately skipped: it's a 24h cache that
// rebuilds itself from the SFU API, and copying it would pull 3.3 MB out of a
// project that is already at its egress cap.
const TABLES = ["users", "groups", "members", "member_courses", "user_courses", "member_blocks"];
const SERIAL = ["users", "groups", "members", "member_blocks"];

for (const t of TABLES) {
  const rows = await src.query(`SELECT * FROM meetup.${t}`);
  if (rows.length > 0) {
    await dst.query(
      `INSERT INTO meetup.${t}
       SELECT * FROM json_populate_recordset(NULL::meetup.${t}, $1::json)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(rows)]
    );
  }
  const [{ n }] = await dst.query(`SELECT COUNT(*)::int AS n FROM meetup.${t}`);
  console.log(`${t}: ${rows.length} read -> ${n} in new db ${rows.length === n ? "OK" : "MISMATCH"}`);
}

// Ids came across as-is, so the sequences have to skip past them or the next
// insert collides with an existing row.
for (const t of SERIAL) {
  await dst.query(
    `SELECT setval(pg_get_serial_sequence('meetup.${t}', 'id'),
                   GREATEST(COALESCE((SELECT MAX(id) FROM meetup.${t}), 0), 1),
                   (SELECT MAX(id) FROM meetup.${t}) IS NOT NULL)`
  );
}
console.log("sequences reset:", SERIAL.join(", "));
