# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Team Contribution Tracker: combines GitHub activity (merged PRs, reviews, commits, capped lines changed) with private peer ratings to show each team member's contribution share per sprint, and flags unbalanced teams for staff. `docs/PRD.md` is the spec. Its contribution model (§4) is exact: signal weights, the 300-line-per-commit cap, rescaling when a signal total is 0, the imbalance threshold, peer-score normalization, the `start ≤ t < end` sprint window and the rating deadline. Implement and test against those definitions, and use the user stories' acceptance criteria (§5) as test cases.

Currently only the scaffold exists: GitHub sign-in and the Auth.js tables. Domain models (courses, teams, sprints, activity) are meant to be added to `prisma/schema.prisma` alongside the features that use them.

## Commands

```bash
npm run dev                  # dev server, http://localhost:3000
npm run build
npm run lint                 # ESLint (next core-web-vitals + typescript)
npm run typecheck            # next typegen && tsc --noEmit
npm run format:check         # Prettier (default config); `npm run format` to fix
npm test                     # Vitest, single run
npx vitest run path/to/file.test.ts   # one test file
npx vitest run -t "name"              # tests matching a name
npm run test:coverage
npx prisma migrate dev       # apply/create migrations (needs DATABASE_URL in .env)
npx prisma generate          # regenerate client (also runs on npm install)
```

Setup: copy `.env.example` to `.env` and fill in `DATABASE_URL` (Postgres/Neon), `AUTH_SECRET`, `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.

## Architecture notes

- **Next.js 16 with `cacheComponents: true`** (`next.config.ts`). Anything that reads request data (cookies, `auth()`, headers) must render inside a `<Suspense>` boundary. See `src/app/page.tsx` and `src/app/auth-status.tsx`. Check `node_modules/next/dist/docs/` before using Next APIs, since they differ from older versions. `LayoutProps`/`PageProps` route types come from `next typegen`.
- **Prisma 7**: the client is generated to `src/generated/prisma` (gitignored) and imported from `@/generated/prisma/client`, not `@prisma/client`. It connects through the `@prisma/adapter-pg` driver adapter. The datasource URL is set in `prisma.config.ts` (loaded via dotenv), not in `schema.prisma`. Use the shared singleton in `src/lib/prisma.ts`.
- **Auth.js v5** (`src/auth.ts`): GitHub is the only provider, because users are matched to commits/PRs/reviews by their GitHub identity. It uses the Prisma adapter with database sessions. Import `auth`, `signIn` and `signOut` from `@/auth`. The route handler is in `src/app/api/auth/[...nextauth]/route.ts`.
- **Path alias** `@/*` → `src/*`, configured in both `tsconfig.json` and `vitest.config.ts`.
- **Tests**: Vitest uses the node environment and only picks up `src/**/*.test.ts` (not `.tsx`). Coverage excludes `src/generated`.
- **Validation**: use `zod` for all request bodies.

## Security requirements (PRD §6, part of Definition of Done)

- Every API route and server action checks the user's role and course/team membership on the server. Students see only their own team's data and their own normalized peer score, never individual ratings or who gave them.
- GitHub access tokens are never sent to the client or logged.
- Request bodies are validated with a schema before they reach the database. All DB access goes through Prisma, with no raw string-built SQL.
