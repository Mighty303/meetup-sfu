import { readFileSync, readdirSync } from "node:fs";

import { envValue } from "./env.mjs";
import { neon } from "@neondatabase/serverless";

const sql = neon(envValue("DATABASE_URL"));

const before = await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema'`;
console.log("schemas before:", before.map((r) => r.schema_name).join(", "));

for (const file of readdirSync("db/migrations").sort()) {
  const body = readFileSync(`db/migrations/${file}`, "utf8");
  // neon-http sends one statement per call; split on semicolons at line ends.
  const statements = body.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--")));
  for (const stmt of statements) await sql.query(stmt);
  console.log(`applied ${file} (${statements.length} statements)`);
}

const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'meetup' ORDER BY table_name`;
console.log("meetup tables:", tables.map((r) => r.table_name).join(", "));
