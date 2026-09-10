# meetup-sfu

Everyone in a group drops their SFU schedule in; the grid shows when you're all
free on campus at the same time.

## How it works

Course data comes from the public [sfucourses API](https://api.sfucourses.com)
(`/v1/rest/sections?term=2025-fall`) — no key, open CORS. **This repo does not
fork sfucourses.com**, it only consumes that endpoint.

Sections are added in-app: search the term's course list and add each one you're
in. Tutorials and labs are their own class numbers, so each is added separately.

Only class numbers are persisted. Meeting times are always resolved against the
API at read time, so an upstream schedule change is picked up without a migration.

### Finding the overlap

1. Expand each member's sections into busy intervals per weekday, dropping any
   section whose date range doesn't cover the displayed week.
2. Merge each member's overlapping intervals.
3. Complement within the search window (default 08:00–22:00) to get free time.
4. Intersect across members; keep windows at least `minMinutes` long.
5. Tag each window with the campus each member's nearest adjacent class is on.
   Different campuses means they can't actually meet — those render amber, not green.

Members who haven't added a schedule yet are excluded from the intersection,
otherwise they'd read as "free always" and silently widen everyone's overlap.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL
npm run migrate              # creates the `meetup` schema; safe to re-run
npm run dev
```

### Google sign-in

Create a **Web application** OAuth client in the Google Cloud Console with these
redirect URIs, one per origin you use:

```
http://localhost:3000/api/auth/callback/google
https://meetup-sfu.vercel.app/api/auth/callback/google
```

Then, to write the credentials to `.env.local` and all three Vercel
environments without them appearing on screen:

```bash
./scripts/set-google-oauth.sh
```

Sign-in is required to join a group or edit a schedule; anyone with the invite
link can still view one. A member row is owned by the user who created it, so
only they can change their schedule or name.

Members added before sign-in existed have no owner. They stay editable by
anyone with the link, and a signed-in user can **claim** one to take it over
along with its saved schedule, rather than starting a duplicate row.

## Admin portal

`/admin` shows every group, every user, what's in the database and how much
space it takes. It's server-gated: the session id on the JWT is resolved to a
`meetup.users` row and that row's email must be on `ADMIN_EMAILS` — which is
only ever written from Google's verified profile at sign-in, never from
anything the browser sends. A signed-in visitor who isn't on the list gets a
404, so the portal doesn't confirm it exists.

`ADMIN_EMAILS` has no default. This repository is public, so a baked-in address
would become the allowlist of every clone of it; leave it unset and the portal
is closed to everyone, including you.

Set `ADMIN_GOOGLE_SUB` to your `meetup.users.google_sub` to pin access to one
Google account rather than an address. The nav link is driven by
`session.isAdmin`, so the allowlist never reaches the client bundle.
`/api/admin/metrics` returns the same figures as JSON, gated identically.

## Scripts

| command | does |
|---|---|
| `npm run migrate` | applies `db/migrations/*.sql` in order (idempotent) |
| `npm run inspect` | prints row counts and term-cache status |
| `node scripts/reset-demo.mjs` | deletes smoke-test groups |
| `node scripts/check-authz.mjs` | verifies the ownership and claim rules against the database |
| `./scripts/set-google-oauth.sh` | writes Google OAuth credentials locally and to Vercel |

## Schema

Everything lives in the `meetup` Postgres schema so it can share a database with
another app without collisions. `meetup.sections_cache` holds one term dump
(~227 kB for Fall 2025) with a 24h TTL, so every member of every group shares a
single upstream fetch.

## Scope

A group is still a secret invite code — anyone with the link can view it. What
sign-in adds is ownership: your schedule and name are yours to edit, and your
identity follows you across devices instead of living in `localStorage`.

After signing in, **My Schedule** in the navigation opens just your saved classes
and free time in the current group. The `?view=mine` link keeps this view selected
when refreshed or bookmarked; **Schedule** switches back to the group. From home,
My Schedule opens your newest group. If you haven't joined one yet, it shows how
to get started.

Not built yet: custom busy blocks (the `meetup.member_blocks` table exists and is
read, but there's no UI to add them), calendar export, meeting-spot suggestions.
