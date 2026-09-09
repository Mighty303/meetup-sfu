"use client";

import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthButton } from "@/components/AuthButton";
import { fromTermCode, scheduleBuilderUrl } from "@/lib/sfu";

interface Membership {
  memberId: number;
  displayName: string;
  color: string;
  classNumbers: string[];
  group: { id: number; code: string; name: string; term: string };
}

interface Me {
  user: { id: number; email: string; name: string | null; image: string | null };
  memberships: Membership[];
}

export default function ProfilePage() {
  const { status: authStatus } = useSession();

  const [data, setData] = useState<Me | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Keyed by member id: one card's error shouldn't blank out another's.
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [links, setLinks] = useState<Record<number, string>>({});
  const [confirmLeave, setConfirmLeave] = useState<number | null>(null);
  const [everywhereName, setEverywhereName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/me");
    if (!res.ok) return;
    const next: Me = await res.json();
    setData(next);
    // Drafts follow whatever the server just returned, so a failed rename
    // doesn't leave a stale value sitting in the box.
    setNames(Object.fromEntries(next.memberships.map((m) => [m.memberId, m.displayName])));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (authStatus === "authenticated") load(); }, [authStatus, load]);

  function setError(memberId: number, message: string | null) {
    setErrors((cur) => {
      const next = { ...cur };
      if (message) next[memberId] = message;
      else delete next[memberId];
      return next;
    });
  }

  /** PATCH one member row. Returns the error message, or null on success. */
  async function renameOne(m: Membership, displayName: string): Promise<string | null> {
    const res = await fetch(`/api/groups/${m.group.code}/members/${m.memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (res.ok) return null;
    return (await res.json().catch(() => ({}))).error ?? "could not save that name";
  }

  async function saveName(m: Membership, e: React.FormEvent) {
    e.preventDefault();
    const displayName = (names[m.memberId] ?? "").trim();
    if (!displayName || displayName === m.displayName) return;
    setSaving(true);
    const err = await renameOne(m, displayName);
    setSaving(false);
    setError(m.memberId, err);
    setNotice(err ? null : `Renamed in ${m.group.name}.`);
    load();
  }

  /**
   * Names are per-group, so a Google name you've outgrown can be left behind in
   * six places. One pass fixes them all; groups where the name is taken are
   * reported rather than silently skipped.
   */
  async function applyNameEverywhere(e: React.FormEvent) {
    e.preventDefault();
    const displayName = everywhereName.trim();
    if (!data || !displayName) return;
    setSaving(true);
    const failed: string[] = [];
    for (const m of data.memberships) {
      if (m.displayName === displayName) continue;
      const err = await renameOne(m, displayName);
      if (err) failed.push(`${m.group.name} (${err})`);
    }
    setSaving(false);
    setNotice(
      failed.length === 0
        ? `Now “${displayName}” in every group.`
        : `Renamed everywhere except: ${failed.join(", ")}.`
    );
    setEverywhereName("");
    load();
  }

  async function saveSchedule(m: Membership, e: React.FormEvent) {
    e.preventDefault();
    const input = links[m.memberId] ?? "";
    if (!input.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${m.group.code}/members/${m.memberId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(m.memberId, (await res.json().catch(() => ({}))).error ?? "could not save that");
      return;
    }
    const { classNumbers }: { classNumbers: string[] } = await res.json();
    setError(
      m.memberId,
      classNumbers.length === 0
        ? "No class numbers found in that — paste the whole sfucourses.com/schedule link."
        : null
    );
    if (classNumbers.length > 0) {
      setLinks((cur) => ({ ...cur, [m.memberId]: "" }));
      setNotice(`Saved ${classNumbers.length} section${classNumbers.length === 1 ? "" : "s"} in ${m.group.name}.`);
    }
    load();
  }

  async function leave(m: Membership) {
    setSaving(true);
    await fetch(`/api/groups/${m.group.code}/members/${m.memberId}`, { method: "DELETE" });
    setSaving(false);
    setConfirmLeave(null);
    setNotice(`Left ${m.group.name}.`);
    load();
  }

  if (authStatus === "loading") {
    return <main className="mx-auto w-full max-w-2xl p-6 text-neutral-500">Loading…</main>;
  }

  if (authStatus !== "authenticated") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign in with Google to edit your name and schedule in the groups you&apos;re in.
        </p>
        <div>
          <button
            onClick={() => signIn("google")}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Sign in
          </button>
        </div>
        <Link href="/" className="text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
          ← Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
          <Link href="/" className="text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            ← Back home
          </Link>
        </div>
        <AuthButton />
      </header>

      {!data ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <>
          <section className="flex items-center gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            {data.user.image && (
              <Image src={data.user.image} alt="" width={48} height={48} className="rounded-full" />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{data.user.name ?? data.user.email}</p>
              <p className="truncate text-sm text-neutral-500">{data.user.email}</p>
              {/* Both come straight from Google on every sign-in, so editing
                  them here would be undone the next time you signed in. */}
              <p className="mt-1 text-xs text-neutral-500">
                Name and picture come from your Google account. The names below are
                what your groups see, and those you can change.
              </p>
            </div>
          </section>

          {data.memberships.length > 1 && (
            <form
              onSubmit={applyNameEverywhere}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-medium">Same name in every group</span>
                <input
                  value={everywhereName}
                  onChange={(e) => setEverywhereName(e.target.value)}
                  placeholder={data.user.name ?? "Your name"}
                  maxLength={60}
                  className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
              <button
                disabled={saving || !everywhereName.trim()}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {saving ? "Saving…" : `Apply to ${data.memberships.length} groups`}
              </button>
            </form>
          )}

          {notice && <p className="text-sm text-emerald-600">{notice}</p>}

          <section className="flex flex-col gap-3">
            <h2 className="font-medium">
              Your groups
              <span className="ml-2 text-sm font-normal text-neutral-500">
                {data.memberships.length}
              </span>
            </h2>

            {data.memberships.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                You&apos;re not in any group yet.{" "}
                <Link href="/" className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
                  Start one or join with a code
                </Link>
                . If a group was made before you signed in, open its link and claim
                your name there.
              </p>
            ) : (
              data.memberships.map((m) => (
                <article
                  key={m.memberId}
                  className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="h-3 w-3 shrink-0 translate-y-0.5 rounded-sm" style={{ backgroundColor: m.color }} />
                    <Link
                      href={`/g/${m.group.code}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {m.group.name}
                    </Link>
                    <span className="text-sm text-neutral-500">
                      {fromTermCode(m.group.term)} · <span className="font-mono">{m.group.code}</span>
                    </span>
                    <span className="ml-auto text-sm text-neutral-500">
                      {m.classNumbers.length > 0
                        ? `${m.classNumbers.length} section${m.classNumbers.length === 1 ? "" : "s"} saved`
                        : "no schedule yet"}
                    </span>
                  </div>

                  <form onSubmit={(e) => saveName(m, e)} className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
                      Name in this group
                      <input
                        value={names[m.memberId] ?? m.displayName}
                        onChange={(e) => setNames((cur) => ({ ...cur, [m.memberId]: e.target.value }))}
                        maxLength={60}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </label>
                    <button
                      disabled={saving || (names[m.memberId] ?? m.displayName).trim() === m.displayName}
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      Save name
                    </button>
                  </form>

                  <form onSubmit={(e) => saveSchedule(m, e)} className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
                      Schedule link
                      <input
                        value={links[m.memberId] ?? ""}
                        onChange={(e) => setLinks((cur) => ({ ...cur, [m.memberId]: e.target.value }))}
                        placeholder="https://sfucourses.com/schedule?courses=5446-5447"
                        className="rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </label>
                    <button
                      disabled={saving || !(links[m.memberId] ?? "").trim()}
                      className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                    >
                      {m.classNumbers.length > 0 ? "Replace" : "Save"}
                    </button>
                  </form>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <a
                      href={scheduleBuilderUrl(m.group.term)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                    >
                      Build it on sfucourses.com ↗
                    </a>
                    {errors[m.memberId] && <p className="text-amber-600">{errors[m.memberId]}</p>}
                    {confirmLeave === m.memberId ? (
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-neutral-500">Leave {m.group.name}?</span>
                        <button
                          onClick={() => leave(m)}
                          disabled={saving}
                          className="rounded-lg border border-red-300 px-2 py-1 text-red-600 disabled:opacity-50 dark:border-red-900"
                        >
                          Yes, leave
                        </button>
                        <button onClick={() => setConfirmLeave(null)} className="text-neutral-500">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmLeave(m.memberId)}
                        className="ml-auto text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline"
                      >
                        Leave group
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
