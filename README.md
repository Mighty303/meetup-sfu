# meetup-sfu

Everyone in a group drops their SFU schedule in; the grid shows when you're all
free on campus at the same time.

## How it works

Course data comes from the public [sfucourses API](https://api.sfucourses.com)
(`/v1/rest/sections?term=2025-fall`) — no key, open CORS. **This repo does not
fork sfucourses.com**, it only consumes that endpoint.

The import path is the useful trick: build a schedule on
[sfucourses.com/schedule](https://sfucourses.com/schedule), copy the link, paste
it in. That URL encodes selections as dash-joined class numbers
(`?courses=5446-5447`), so pasting it is a full schedule import. Typed class
numbers work too.

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

## Scripts

| command | does |
|---|---|
| `npm run migrate` | applies `db/migrations/*.sql` in order (idempotent) |
| `npm run inspect` | prints row counts and term-cache status |
| `node scripts/reset-demo.mjs` | deletes smoke-test groups |

## Schema

Everything lives in the `meetup` Postgres schema so it can share a database with
another app without collisions. `meetup.sections_cache` holds one term dump
(~227 kB for Fall 2025) with a 24h TTL, so every member of every group shares a
single upstream fetch.

## v0 scope

No auth — a group is a secret invite code, and this browser remembers which
member you are via `localStorage`. Fine for a friend group; add real auth before
this is public.

Not built yet: custom busy blocks (the `meetup.member_blocks` table exists and is
read, but there's no UI to add them), calendar export, meeting-spot suggestions.
