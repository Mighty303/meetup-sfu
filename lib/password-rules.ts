/**
 * What counts as an acceptable password.
 *
 * Split from password.ts, which hashes, because the sign-in form is a client
 * component and importing the hashing module would pull node:crypto into the
 * browser bundle. Rules are shared; the hashing is not.
 */

/**
 * Long rather than fussy. Length is the only property that reliably buys
 * entropy, and a rule demanding a digit and a symbol mostly buys `Password1!`
 * — so this asks for one number more than feels convenient and nothing else.
 */
export const MIN_PASSWORD_LENGTH = 10;
// Not a security limit, a denial-of-service one: scrypt's cost is in N and r,
// not in the input, but there is no reason to hash a megabyte.
export const MAX_PASSWORD_LENGTH = 200;

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
