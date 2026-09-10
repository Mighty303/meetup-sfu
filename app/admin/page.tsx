import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AuthButton } from "@/components/AuthButton";
import { Avatar } from "@/components/Avatar";
import { adminFor } from "@/lib/admin";
import {
  formatBytes,
  getAdminMetrics,
  type AdminMetrics,
  type GroupRow,
} from "@/lib/metrics";
import { fromTermCode } from "@/lib/sfu";

export const metadata = { title: "Admin · meetup-sfu" };

// The whole point is the numbers as they are right now, so no caching of any
// kind: not the route, not the fetch, not a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();

  // Signed out gets an invitation to sign in — the path is guessable and
  // reveals nothing. Signed in and not on the allowlist gets a 404, so the
  // portal doesn't confirm it exists to someone who went looking.
  if (!session?.appUserId) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-neutral-500">Sign in to continue.</p>
        <div>
          <AuthButton />
        </div>
      </main>
    );
  }

  const admin = await adminFor(session.appUserId);
  if (!admin) notFound();

  const m = await getAdminMetrics();

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-4 sm:p-6">
      <Header metrics={m} email={admin.email} />
      <Headline metrics={m} />
      <StorageSection metrics={m} />
      <ActivitySection metrics={m} />
      <GroupsSection metrics={m} />
      <UsersSection metrics={m} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CacheSection metrics={m} />
        <CoursesSection metrics={m} />
      </div>
      <SecuritySection googleSub={admin.googleSub} pinned={admin.subPinned} />
    </main>
  );
}

/* ------------------------------------------------------------------ header */

function Header({ metrics, email }: { metrics: AdminMetrics; email: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-neutral-500">
          Signed in as {email} · read as of{" "}
          <time dateTime={metrics.generatedAt}>{fullTime(metrics.generatedAt)}</time>
        </p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <a
          href="/api/admin/metrics"
          className="text-neutral-500 underline-offset-2 hover:underline"
        >
          Raw JSON
        </a>
        {/* A plain link, not a router push: this is a server component and the
            numbers only change on a fresh request. */}
        <a
          href="/admin"
          className="rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Refresh
        </a>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- headline */

function Headline({ metrics: { totals } }: { metrics: AdminMetrics }) {
  const stickiness = totals.members === 0 ? 0 : totals.membersWithCourses / totals.members;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Stat label="Groups" value={totals.groups} hint={`${totals.newGroups7d} this week`} />
      <Stat label="Users" value={totals.users} hint={`${totals.newUsers7d} this week`} />
      <Stat
        label="Signed in, 7d"
        value={totals.activeUsers7d}
        hint={`of ${totals.users} ever`}
      />
      <Stat
        label="Member rows"
        value={totals.members}
        hint={`${totals.ownerlessMembers} unclaimed`}
      />
      <Stat
        label="Courses saved"
        value={totals.courseRows}
        hint={`${totals.blockRows} custom blocks`}
      />
      <Stat
        label="Schedules filled"
        value={pct(stickiness)}
        hint={`${totals.membersWithCourses} of ${totals.members} members`}
      />
    </section>
  );
}

/* ----------------------------------------------------------------- storage */

function StorageSection({ metrics: { storage } }: { metrics: AdminMetrics }) {
  const used = storage.limitBytes > 0 ? storage.databaseBytes / storage.limitBytes : 0;
  const biggest = Math.max(1, ...storage.tables.map((t) => t.totalBytes));

  return (
    <Panel
      title="Database space"
      note="Whole Neon database, not just this app — the tutoring app shares it."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatBytes(storage.databaseBytes)}
              </span>
              <span className="text-sm text-neutral-500">
                of {formatBytes(storage.limitBytes)} · {pct(used)}
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={`h-full rounded-full ${
                  used > 0.9 ? "bg-red-500" : used > 0.7 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, used * 100)}%` }}
              />
            </div>
          </div>

          <dl className="flex flex-col gap-1.5 text-sm">
            {storage.schemas.map((s) => (
              <div key={s.name} className="flex items-baseline justify-between gap-2">
                <dt className="text-neutral-500">
                  <code className="font-mono">{s.name}</code>
                  <span className="ml-1.5 text-xs">({s.tables} tables)</span>
                </dt>
                <dd className="tabular-nums">{formatBytes(s.bytes)}</dd>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-1.5 dark:border-neutral-800">
              <dt className="text-neutral-500">Uploaded pictures</dt>
              <dd className="tabular-nums">
                {formatBytes(storage.avatarBytes)}
                {storage.largestAvatarBytes > 0 && (
                  <span className="ml-1.5 text-xs text-neutral-500">
                    biggest {formatBytes(storage.largestAvatarBytes)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-neutral-500">
            Table and schema sizes come from Postgres itself. Neon bills on its own
            snapshot of storage plus compute time, so treat this as the shape of the
            data rather than the invoice.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="pb-2 font-medium">Table</th>
                <th className="pb-2 text-right font-medium">Rows</th>
                <th className="pb-2 text-right font-medium">Data</th>
                <th className="pb-2 text-right font-medium">Indexes</th>
                <th className="pb-2 pl-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {storage.tables.map((t) => (
                <tr key={t.name} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2 font-mono text-xs">{t.name}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">
                    {num(t.liveRows)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatBytes(t.heapBytes)}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">
                    {formatBytes(t.indexBytes)}
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-neutral-500"
                          style={{ width: `${(t.totalBytes / biggest) * 100}%` }}
                        />
                      </div>
                      <span className="tabular-nums">{formatBytes(t.totalBytes)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* n_live_tup is the planner's estimate, refreshed by autovacuum, so
              it can trail the exact counts in the cards above. */}
          <p className="mt-2 text-xs text-neutral-500">
            Row counts are Postgres&apos;s own estimates and lag slightly behind writes.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- activity */

function ActivitySection({ metrics: { daily } }: { metrics: AdminMetrics }) {
  const peak = Math.max(1, ...daily.map((d) => Math.max(d.users, d.groups)));
  const totalUsers = daily.reduce((s, d) => s + d.users, 0);
  const totalGroups = daily.reduce((s, d) => s + d.groups, 0);

  return (
    <Panel
      title="Last 30 days"
      note={`${totalUsers} first sign-ins, ${totalGroups} groups created (UTC days).`}
    >
      <div className="flex items-end gap-[3px] overflow-x-auto pb-1">
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.users} new users, ${d.groups} new groups`}
            className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-[2px]"
          >
            <div className="flex h-24 w-full items-end justify-center gap-px">
              <Column value={d.users} peak={peak} className="bg-blue-500" />
              <Column value={d.groups} peak={peak} className="bg-emerald-500" />
            </div>
            <span className="text-[9px] tabular-nums text-neutral-400">
              {d.day.slice(-2)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-neutral-500">
        <Legend className="bg-blue-500">New users</Legend>
        <Legend className="bg-emerald-500">New groups</Legend>
      </div>
    </Panel>
  );
}

function Column({ value, peak, className }: { value: number; peak: number; className: string }) {
  // A zero day stays a hairline rather than nothing, so the axis reads as a
  // continuous 30 days instead of a row of floating bars.
  const height = value === 0 ? 2 : Math.max(4, (value / peak) * 96);
  return (
    <div
      className={`w-full max-w-[10px] rounded-sm ${
        value === 0 ? "bg-neutral-200 dark:bg-neutral-800" : className
      }`}
      style={{ height }}
    />
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-sm ${className}`} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ groups */

/** What's wrong with a group, if anything — a group needs two schedules to be useful. */
function groupFlag(g: GroupRow): { text: string; className: string } | null {
  if (g.members === 0) return { text: "empty", className: "bg-red-500/15 text-red-600 dark:text-red-400" };
  if (g.scheduled === 0) return { text: "no schedules", className: "bg-red-500/15 text-red-600 dark:text-red-400" };
  if (g.scheduled === 1) return { text: "needs one more", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  return null;
}

function GroupsSection({ metrics: { groups } }: { metrics: AdminMetrics }) {
  const dead = groups.filter((g) => groupFlag(g)).length;
  return (
    <Panel
      title={`Groups (${groups.length})`}
      note={
        dead > 0
          ? `${dead} can't produce an overlap yet — fewer than two members have added a schedule.`
          : "Every group has at least two schedules in it."
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="pb-2 font-medium">Code</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Term</th>
              <th className="pb-2 text-right font-medium">Members</th>
              <th className="pb-2 text-right font-medium">Signed in</th>
              <th className="pb-2 text-right font-medium">Scheduled</th>
              <th className="pb-2 text-right font-medium">Courses</th>
              <th className="pb-2 pl-4 font-medium">Created</th>
              <th className="pb-2 pl-4 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const flag = groupFlag(g);
              return (
                <tr key={g.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2">
                    <Link
                      href={`/g/${g.code}`}
                      className="font-mono text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                    >
                      {g.code}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate py-2">
                    {g.name}
                    {flag && (
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${flag.className}`}
                      >
                        {flag.text}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-neutral-500">{fromTermCode(g.term)}</td>
                  <td className="py-2 text-right tabular-nums">{g.members}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">{g.signedIn}</td>
                  <td className="py-2 text-right tabular-nums">{g.scheduled}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">{g.courseRows}</td>
                  <td className="py-2 pl-4 text-neutral-500">{ago(g.createdAt)}</td>
                  <td className="py-2 pl-4 text-neutral-500">
                    {g.lastSeen ? ago(g.lastSeen) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------- users */

function UsersSection({ metrics: { users, totals } }: { metrics: AdminMetrics }) {
  return (
    <Panel
      title={`Users (${users.length})`}
      note={`${totals.usersInGroups} are in at least one group · ${totals.customAvatars} uploaded a picture · newest sign-in first.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="pb-2 font-medium">Person</th>
              <th className="pb-2 text-right font-medium">Groups</th>
              <th className="pb-2 text-right font-medium">Courses</th>
              <th className="pb-2 pl-4 font-medium">Joined</th>
              <th className="pb-2 pl-4 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <Avatar src={u.image} name={u.name ?? u.email} size={24} />
                    <div className="min-w-0">
                      <div className="truncate">
                        {u.name ?? "—"}
                        {u.customAvatar && (
                          <span className="ml-1.5 text-[10px] text-neutral-400">own picture</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-neutral-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums">{u.groups}</td>
                <td className="py-2 text-right tabular-nums text-neutral-500">{u.courseRows}</td>
                <td className="py-2 pl-4 text-neutral-500">{ago(u.createdAt)}</td>
                <td className="py-2 pl-4 text-neutral-500">{ago(u.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------- cache */

function CacheSection({ metrics: { cache } }: { metrics: AdminMetrics }) {
  return (
    <Panel
      title="Term cache"
      note="One upstream fetch per term, shared by every group. A stale row is refetched on the next page load that needs it."
    >
      {cache.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing cached — the next group page will fill it.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {cache.map((c) => (
            <li key={c.term} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${c.fresh ? "bg-emerald-500" : "bg-neutral-400"}`}
                  aria-hidden
                />
                {fromTermCode(c.term)}
                <span className="text-xs text-neutral-500">{num(c.courses)} courses</span>
              </span>
              <span className="tabular-nums text-neutral-500">
                {formatBytes(c.bytes)} · {c.fresh ? "fresh" : "stale"} · {ago(c.fetchedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- courses */

function CoursesSection({ metrics: { topCourses } }: { metrics: AdminMetrics }) {
  const peak = Math.max(1, ...topCourses.map((c) => c.members));
  return (
    <Panel title="Most-saved courses" note="Across every group. Names resolve from the cache above.">
      {topCourses.length === 0 ? (
        <p className="text-sm text-neutral-500">Nobody has added a course yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {topCourses.map((c) => (
            <li key={`${c.term}-${c.classNumber}`} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${(c.members / peak) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right tabular-nums text-neutral-500">
                {c.members}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- security */

function SecuritySection({ googleSub, pinned }: { googleSub: string; pinned: boolean }) {
  return (
    <Panel title="Access">
      <p className="text-sm text-neutral-500">
        This page is gated server-side on the email attached to your Google account,
        read from the database rather than from anything the browser sends. A forged
        session would need <code className="font-mono text-xs">AUTH_SECRET</code> as
        well as the account itself.
      </p>
      {pinned ? (
        <p className="mt-2 text-sm text-emerald-600">
          Pinned to your Google account id as well as your address.
        </p>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          To lock it to this exact Google account and not merely the address, set{" "}
          <code className="font-mono text-xs">ADMIN_GOOGLE_SUB</code> to{" "}
          <code className="font-mono text-xs break-all">{googleSub}</code>.
        </p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ pieces */

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {note && <p className="mb-4 mt-1 text-xs text-neutral-500">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? num(value) : value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

const NUM = new Intl.NumberFormat("en-CA");
function num(value: number): string {
  return NUM.format(value);
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction > 0 && fraction < 0.01 ? 2 : 0)}%`;
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

/** Coarse on purpose — the exact minute of a sign-in is never the question. */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
