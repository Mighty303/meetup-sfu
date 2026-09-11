import { NextResponse } from "next/server";
import { hashPassword, passwordProblem } from "@/lib/password";
import { createPasswordUser, isEmailShaped, normalizeEmail } from "@/lib/users";

/**
 * Creating an account without Google.
 *
 * Not under NextAuth's own [...nextauth] handler — that route owns sign-in, and
 * registration is a different thing that happens to live next door. The client
 * calls this, then signs in with the "password" provider, so there is exactly
 * one code path that issues a session.
 *
 * The address is never mailed, so it is not verified and is treated everywhere
 * as a label rather than an identity (lib/admin.ts is where that matters).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const password = body?.password;

  if (!isEmailShaped(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const problem = passwordProblem(password);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const user = await createPasswordUser({
    email,
    name: name || null,
    passwordHash: await hashPassword(password as string),
  });

  // Null means the unique index refused it. Saying so plainly is a small
  // disclosure — it confirms the address has an account here — but the
  // alternative is a sign-up that silently does nothing, and the sign-in form
  // one tab over would confirm the same thing anyway.
  if (!user) {
    return NextResponse.json(
      { error: "That email already has an account. Sign in instead." },
      { status: 409 }
    );
  }

  // No session here, and nothing from the row worth returning: the client's
  // next move is signIn("password"), which is the only thing that issues one.
  return NextResponse.json({ ok: true }, { status: 201 });
}
