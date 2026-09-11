/**
 * Where to send someone after they sign in.
 *
 * The value arrives in a query string, which means anyone can put anything in
 * it and mail the link around — so this is an allowlist by shape, not a
 * sanitiser. Only a path on this site survives; everything else falls back to
 * the home page.
 *
 * The `//` case is the one worth naming: `//evil.example` is a protocol-
 * relative URL, not a path, and a check for a leading slash alone would wave it
 * through and hand someone an open redirect wearing this site's domain.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
