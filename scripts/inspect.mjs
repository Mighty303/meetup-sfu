import { envValue } from "./env.mjs";
import { neon } from "@neondatabase/serverless";

const sql = neon(envValue("DATABASE_URL"));
const cache = await sql`SELECT term, fetched_at, pg_size_pretty(pg_column_size(payload)::bigint) AS size FROM meetup.sections_cache`;
console.log("cache:", cache.map((r) => `${r.term} ${r.size} @ ${r.fetched_at.toISOString()}`).join(" | "));
for (const t of ["groups", "members", "member_courses", "member_blocks"]) {
  const rows = await sql.query(`SELECT COUNT(*)::int AS n FROM meetup.${t}`);
  console.log(`  ${t}: ${rows[0].n}`);
}
const pub = await sql`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`;
console.log("tutoring app tables in public (untouched):", pub[0].n);
