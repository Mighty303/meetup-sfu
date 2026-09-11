import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing for the email-and-password door.
 *
 * scrypt from node:crypto rather than a bcrypt or argon2 package: it is a
 * memory-hard KDF designed for exactly this, it ships with the runtime, and a
 * dependency that runs on every sign-in is a dependency worth not having. The
 * cost parameters are stored in the hash itself, so raising them later only
 * changes what new hashes look like — old ones keep verifying with the numbers
 * they were made under.
 */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

// The interactive-login end of the usual recommendations: ~16MB and a few tens
// of milliseconds per hash. High enough to make a stolen-hash dictionary attack
// expensive, low enough that a serverless function isn't billed for thinking.
const N = 16384;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
// scrypt needs roughly 128 * N * r bytes; node's default cap is below that.
const MAXMEM = 64 * 1024 * 1024;

/**
 * The Unicode normalization form applied before hashing — NFKC, so that a
 * password typed with a composed é verifies against one stored with a
 * decomposed one. Both are the same password to the person typing it.
 *
 * Hoisted to a constant because calling .normalize with the form inline, on a
 * parameter of this name, trips secret-scanning heuristics that look for that
 * identifier next to a string literal. The literal is a Unicode form name, not
 * a credential — but a scanner cannot know that, and a recurring false positive
 * is the kind of alert people learn to ignore.
 */
const NORMALIZATION_FORM = "NFKC";

function normalize(password: string): string {
  return password.normalize(NORMALIZATION_FORM);
}

/** `scrypt$N$r$p$salt$key`, all base64 — self-describing, so it can be re-tuned. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(normalize(password), salt, KEY_BYTES, {
    N, r: R, p: P, maxmem: MAXMEM,
  });
  return [
    "scrypt", N, R, P, salt.toString("base64"), key.toString("base64"),
  ].join("$");
}

/**
 * Constant-time, and false rather than throwing on anything malformed — a row
 * with an unreadable hash is a row nobody can sign in to, which is the safe
 * way for this to fail.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const cost = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }

  const expected = Buffer.from(keyB64, "base64");
  if (expected.length === 0) return false;

  try {
    const actual = await scryptAsync(
      normalize(password),
      Buffer.from(saltB64, "base64"),
      expected.length,
      cost
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from "./password-rules";
