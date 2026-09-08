// Next.js strips surrounding quotes from .env values; plain node does not, and
// the Vercel CLI writes them quoted. Scripts share this loader so they agree.
import { readFileSync } from "node:fs";

export function envValue(key, file = ".env.local") {
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${file}`);
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}
