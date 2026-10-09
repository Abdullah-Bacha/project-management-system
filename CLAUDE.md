# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # next dev -p 3000
npm run build
npm run lint         # BROKEN: `next lint` was removed in Next 16 and no ESLint is installed; use type-check
npm run type-check   # tsc --noEmit
npm run seed         # tsx src/lib/db/seed.ts (demo data; wipes users/teams/projects/tasks/comments/notifications)
npm test             # vitest run (all suites)
npx vitest run src/lib/auth/membership.test.ts   # single file
npx vitest run -t "name fragment"                # single test by name
```

- Next docs are bundled at `node_modules/next/dist/docs/` (see AGENTS.md); read the relevant guide before writing Next-specific code.
- Needs `.env.local` with `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (each secret ≥ 32 chars). There are intentionally no fallback defaults — the app throws at import time if they're missing (`lib/auth/jwt.ts`, `lib/db/mongodb.ts`). Optional: `DEMO_ACCOUNT_EMAIL` (default `testing@gmail.com`), `NEXT_PUBLIC_API_URL`.
- Tests: everything under `src/**/*.test.ts` is a unit test with models mocked (no server/DB needed) and always runs. The suites in `tests/` are **end-to-end over HTTP** against a running server and a real DB (`TEST_BASE_URL`, default `http://localhost:3000`) and need the seed admin `test@example.com`. Caveat: the older `tests/*` suites use `describe.runIf(() => serverUp)`, which is evaluated before `beforeAll`, so with no server they *fail* instead of skipping; `tests/stabilization.test.ts` gates correctly (`ctx.skip()`). First hit per route is slow under Turbopack, hence the 20s timeout in `vitest.config.mts`.
- The many `*.md` files at the repo root (README, QUICK_START, PHASE_1_COMPLETION, etc.) are build-progress notes and are partly stale (e.g. they claim Next 14 / Socket.io; the app is Next 16 + SSE). Trust `package.json` and the code.

## Where things live

One Next.js app (path alias `@/*` → `src/*`), React 19, Tailwind v4, Mongoose/MongoDB, Zustand, axios, Zod. The split is enforced by `src/architecture.test.ts`.

```
src/
├── app/
│   ├── api/                 REST handlers — transport only (see "Request flow")
│   ├── auth/                login, forgot/reset password
│   └── dashboard/           pages; projects/[id]/layout.tsx loads the project once for all its tabs
├── components/
│   ├── ui/                  Button, ButtonLink, Input, Select, Textarea, Avatar, Modal, Toast, StatsCard, PageState…
│   └── layout/              Sidebar, Header, navigation config (the dashboard shell)
├── features/                UI owned by one domain: projects, tasks, teams, notifications, reports, auth
├── hooks/                   useAuth, useLoad (one-shot fetch), useRealtimeData / useRealtimeEvent, useToast
├── services/                BROWSER code: axios client (token refresh), SSE client (events.ts), one API wrapper per resource
├── store/                   Zustand auth state
├── types/                   types + enum constants shared by UI and server (no server imports)
└── lib/                     SERVER code (plus roles.ts, shared)
    ├── auth/                jwt, password, middleware (authenticateRequest), authorize (guards), rate-limit, demo
    ├── db/                  mongodb connection, Mongoose models (+ indexes), seed
    ├── services/            business logic: projects (membership, progress, cascade), tasks, notifications
    ├── validation/          Zod helpers: parseBody, validationError, parsePagination/parseFilters
    └── realtime/            bus.ts — MongoDB change stream → per-user filtered SSE signals
```

Note the two `services` folders: `src/services` is what the **browser** uses to call the API; `src/lib/services` is **server** business logic. Browser code must never import `lib/db|auth|services|validation|realtime`, mongoose, jsonwebtoken or bcryptjs.

## Architecture

**Roles & access model.** Roles are `admin | team_leader | developer` (`types/user.ts`, labels/colours in `lib/roles.ts`). Registration is closed: admins provision accounts via `/api/admin/users`. A project has an owner (the admin who created it), an assigned `team` (with a `teamLeader`), and members (owner + team roster + hand-added extras; `lib/services/projects.ts#composeMembers` is the only place that builds the list).

**Request flow.** Route handler → `authenticateRequest` / a guard from `lib/auth/authorize.ts` → `parseBody`/`parsePagination` (`lib/validation`) → service function (`lib/services/*`) or direct Mongoose for trivial CRUD → JSON. Validation failures are always `{ error, details }` with 400.

**Authorization is centralized in `lib/auth/authorize.ts` — every project-scoped route must go through it** rather than just `authenticateRequest`:
- `authenticateRequest` verifies the JWT **and re-reads the account** (status, role, email, `tokenVersion`) on every call, so suspension, role changes and password resets take effect immediately; the role in the JWT is never trusted.
- `authorizeProject(req, id, { ownerOnly | editorOnly, populate })` and `authorizeTask(req, id, { editorOnly | assigneeOrEditor, populate })` return `{ response }` (return it verbatim) or `{ data }` with the loaded docs. `authorizeAdmin(req, { blockDemo })` gates admin routes.
- Non-members get **404, not 403**, so ids can't be probed.
- "Editor" = project owner OR the live `teamLeader` of the project's current team (checked against the Team doc, not the account role). Developers' only write is moving tasks assigned to them.
- `GET /api/projects/:id` returns `capabilities` (`canEdit`, `canManageMembers`, `canDelete`, `canAssignTeam`); the UI uses those instead of re-deriving permissions. The server still enforces every rule independently.
- Auth is `Authorization: Bearer <access JWT>` (no cookies). Access TTL 1h, refresh 7d; `services/client.ts` holds tokens in localStorage and single-flights `refreshSession()` (used by the 401 interceptor and the SSE client). Tokens carry `tv` = `User.tokenVersion`; a password reset bumps it, revoking older tokens. Logout is client-side only (no per-session revocation yet).
- Login is rate limited in memory (`lib/auth/rate-limit.ts`; per-process, so single-node only). The shared public demo account (`lib/auth/demo.ts`) may not mutate users/teams/staffing and sees masked emails.
- `/api/users/search` is admin-only. List endpoints cap `limit` (see `parsePagination` calls).

**Realtime (SSE, not websockets).** `lib/realtime/bus.ts` runs one MongoDB change stream (requires a replica set/Atlas) and routes each change **only to the users it concerns**: notifications → their owner; projects/tasks/comments → members of that project; teams → the team's people. Signals are `{collection, op, id, projectId?, taskId?, updatedAt?}` — ids only, no document data — so clients refetch through the normal authorized APIs. Client side: `services/events.ts` (one shared connection, reconnect + token refresh) and `hooks/useRealtimeData.ts`:
- `useRealtimeData({ endpoint, watch, match })` — fetch, then refetch on matching signals; slow polling only while SSE is down.
- `useRealtimeEvent(collections, handler, match)` — get each signal (e.g. `features/tasks/useProjectTasks.ts` patches one task instead of reloading the board; `TaskComments` appends one comment).
- If you add a mutation that should live-update the UI, make sure the collection is watched (and in `bus.ts`'s `WATCHED` list).

**Derived data.** `syncProjectProgress` (`lib/services/projects.ts`) recomputes a project's completion %; call it after task create/delete/status changes. `deleteProjectCascade` / `deleteTaskCascade` remove dependents (tasks, comments, notifications, reports).

**Design tokens.** All colours come from `@theme` in `app/globals.css` (brand/interactive, surface, ink, hairline, positive/caution/critical/info with `-subtle` and `-strong`, role-*, focus, on-brand). Don't use raw Tailwind palette colours or hex values in components.

**Page states.** Data pages render exactly one of loading / error / empty / data (`useLoad` or `useRealtimeData` + `components/ui/PageState.tsx`); never treat "no data yet" as "still loading".
