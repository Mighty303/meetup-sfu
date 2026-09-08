// Removes smoke-test groups. Cascades to members and courses.
import { envValue } from "./env.mjs";
import { neon } from "@neondatabase/serverless";

const sql = neon(envValue("DATABASE_URL"));
const gone = await sql`DELETE FROM meetup.groups WHERE name = 'Smoke Test Crew' RETURNING code`;
console.log("deleted groups:", gone.map((r) => r.code).join(", ") || "(none)");
