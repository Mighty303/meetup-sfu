"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { currentTermCode, fromTermCode } from "@/lib/sfu";

/**
 * Starting a group and joining one by code — the two things both halves of the
 * home page end with, whether you've just arrived or you're signed in and
 * looking at a list of groups you're already in.
 *
 * Creating works signed out: the group is simply left without an admin until
 * the first person joins and adopts it.
 */

const TERMS = (() => {
  const now = new Date();
  const seasons = ["spring", "summer", "fall"];
  const out: string[] = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const s of seasons) out.push(`${year}-${s}`);
  }
  return out;
})();

export function GroupForms({ startDelay = 0 }: { startDelay?: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [term, setTerm] = useState(currentTermCode());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, term }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "could not create group");
      setBusy(false);
      return;
    }
    const group = await res.json();
    router.push(`/g/${group.code}`);
  }

  return (
    <>
      <form
        onSubmit={create}
        className="fade-up mx-auto w-full max-w-lg flex flex-col gap-3"
        style={{ animationDelay: `${startDelay}ms` }}
      >
        <label className="text-sm font-medium">Start a group</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CMPT study crew"
          required
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <select
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {TERMS.map((t) => (
            <option key={t} value={t}>{fromTermCode(t)}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Creating…" : "Create group"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <form
        onSubmit={(e) => { e.preventDefault(); router.push(`/g/${code.trim().toUpperCase()}`); }}
        className="fade-up mx-auto w-full max-w-lg flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800"
        style={{ animationDelay: `${startDelay + 80}ms` }}
      >
        <label className="text-sm font-medium">Or join with a code</label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC1234"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 font-mono uppercase dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button type="submit" className="rounded-lg border border-neutral-300 px-4 dark:border-neutral-700">
            Go
          </button>
        </div>
      </form>
    </>
  );
}
