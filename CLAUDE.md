# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@docs/PRD.md

## Project

Team Contribution Tracker: combines GitHub activity (merged PRs, reviews, commits, capped lines changed) with private peer ratings to show each team member's contribution share per sprint, and flags unbalanced teams for staff. `docs/PRD.md` is the spec. Its contribution model (§4) is exact: signal weights, the 300-line-per-commit cap, rescaling when a signal total is 0, the imbalance threshold, peer-score normalization, the `start ≤ t < end` sprint window and the rating deadline. Implement and test against those definitions, and use the user stories' acceptance criteria (§5) as test cases.

Currently only the scaffold exists: GitHub sign-in and the Auth.js tables. Domain models (courses, teams, sprints, activity) are meant to be added to `prisma/schema.prisma` alongside the features that use them.

## Tech stack

| Layer       | Choice                                                              |
| ----------- | ------------------------------------------------------------------- |
| App         | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind v4 |
| Database    | PostgreSQL (Neon) with Prisma 7 (`@prisma/adapter-pg`)              |
| Auth        | Auth.js v5 (`next-auth` beta), GitHub provider, Prisma adapter      |
| Validation  | Zod 4                                                               |
| GitHub data | Octokit (REST/GraphQL), not installed yet                           |
| AI summary  | Claude Agent SDK (US7, stretch), not installed yet                  |
| Tests       | Vitest 5 + v8 coverage; Playwright for E2E later                    |
| Hosting     | Vercel (preview deploys on PRs, production on merge to `main`)      |

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

Setup: copy `.env.example` to `.env` and fill in `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (or run `npx neon@latest env pull`), `AUTH_SECRET`, `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.

## Architecture notes

- **Next.js 16 with `cacheComponents: true`** (`next.config.ts`). Anything that reads request data (cookies, `auth()`, headers) must render inside a `<Suspense>` boundary. See `src/app/page.tsx` and `src/app/auth-status.tsx`. Check `node_modules/next/dist/docs/` before using Next APIs, since they differ from older versions. `LayoutProps`/`PageProps` route types come from `next typegen`.
- **Prisma 7**: the client is generated to `src/generated/prisma` (gitignored) and imported from `@/generated/prisma/client`, not `@prisma/client`. It connects through the `@prisma/adapter-pg` driver adapter. The database is Neon (project linked via `neon.ts`). The app connects with the pooled `DATABASE_URL` through a `pg` Pool registered with `attachDatabasePool` for Vercel; Prisma CLI/migrations use the direct `DATABASE_URL_UNPOOLED`, set in `prisma.config.ts` (loaded via dotenv), not in `schema.prisma`. Use the shared singleton `prisma` from `@/server/db`. Server-only code that touches the database or outside services lives in `src/server/`, apart from the pure domain logic in `src/lib/`.
- **Auth.js v5** (`src/auth.ts`): GitHub is the only provider, because users are matched to commits/PRs/reviews by their GitHub identity. It uses the Prisma adapter with database sessions. Import `auth`, `signIn` and `signOut` from `@/auth`. The route handler is in `src/app/api/auth/[...nextauth]/route.ts`.
- **Path alias** `@/*` → `src/*`, configured in both `tsconfig.json` and `vitest.config.ts`.
- **Tests**: Vitest uses the node environment and only picks up `src/**/*.test.ts` (not `.tsx`). Coverage excludes `src/generated`.
- **Validation**: use `zod` for all request bodies.

## Security requirements (PRD §6, part of Definition of Done)

- Every API route and server action checks the user's role and course/team membership on the server. Students see only their own team's data and their own normalized peer score, never individual ratings or who gave them.
- GitHub access tokens are never sent to the client or logged.
- Request bodies are validated with a schema before they reach the database. All DB access goes through Prisma, with no raw string-built SQL.

## Coding conventions

- **Domain logic is pure functions in `src/lib/`**: signal counting, share calculation, imbalance flags, peer-score normalization, sprint windows and rating deadlines. These modules must not import Prisma, `next/*`, `@/auth` or Octokit. They take plain data and return plain data, so they can be unit-tested without a database or a request.
- Route handlers, server actions and pages are thin: authenticate, authorize, validate with Zod, load data through Prisma, call the pure functions, then render or return the result.
- **Conventional Commits**: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, with an optional scope (e.g. `feat(share): rescale weights when a signal is 0`).
- **One branch per issue**, named after it (e.g. `feat/12-contribution-share`). Open a PR to `main` for every change; don't commit features directly to `main`. Reference the issue in the PR (`Closes #12`).

## Testing strategy

- **Strict TDD, visible in the git history.** For each behavior:
  1. `test: …`: commit the failing test first (red).
  2. `feat: …` / `fix: …`: commit the minimum code that makes it pass (green).
  3. `refactor: …`: optionally clean up with the tests still green.
- **The PRD's acceptance criteria are the test cases.** Name tests after the AC they cover (e.g. `describe("US4-AC2: lines capped at 300 per commit")`) and cover the edge cases §4 spells out: a signal total of 0, all signals 0 ("no activity", not 0%), bot and merge commits, unmatched authors, sprint boundaries (`start ≤ t < end`), missing peer ratings (missing, not 0), self-ratings rejected, the 40/60 pair split.
- **Coverage target: 70%** of lines (`npm run test:coverage`), with the pure modules in `src/lib/` close to 100%.
- Unit tests sit next to the code as `*.test.ts`. **Playwright E2E** tests for the main user flows come later and aren't set up yet.

## Do's and Don'ts

**Do**

- Read the relevant guide in `node_modules/next/dist/docs/` before using a Next.js API.
- Run `npm run lint`, `npm run typecheck` and `npm test` before every commit.
- Wrap request-time reads (`auth()`, cookies, headers) in `<Suspense>`.
- Check role and team membership on the server in every route and server action.
- Add a Prisma migration (`npx prisma migrate dev --name …`) with every schema change and commit it.

**Don't**

- Don't change PRD formulas, weights, caps or thresholds to make a test pass. If the PRD looks wrong, raise it.
- Don't import Prisma, Next or Auth into `src/lib/` domain modules.
- Don't write implementation code before a failing test, or squash red/green commits together.
- Don't expose individual peer ratings or GitHub tokens to the client or in logs.
- Don't import from `@prisma/client` (use `@/generated/prisma/client`) or edit `src/generated/`.
- Don't commit `.env` or skip hooks with `--no-verify`.

## Permissions

`.claude/settings.json` is committed and shared by the team:

- **allow**: runs without a prompt. Covers lint, typecheck, format, tests, `prisma generate`, local git (status/diff/log/branch/switch/add/commit) and read-only `gh` commands.
- **ask**: always prompts. Covers anything that leaves the machine or changes dependencies or the database: `git push`, `npm install`, `prisma migrate`, `gh pr create`/`merge`.
- **deny**: always blocked, even if an allow or ask rule matches. Covers reading or editing `.env`, `.env.local` and `.env.*.local` (`.env.example` is fine), editing `src/generated/**`, force-push, `commit --no-verify` and `rm -rf`/`rm -fr`.

Permission rules only match the start of a command, so flag-order tricks like `git commit -m x --no-verify` aren't fully blocked. A PreToolUse hook will enforce these rules in P3.

Put personal overrides in `.claude/settings.local.json`, which is gitignored. Don't loosen the shared deny list.

## Context management

- `/clear` between unrelated tasks (e.g. after merging one issue's PR, before starting the next) so stale context doesn't leak in. CLAUDE.md and the PRD are reloaded automatically.
- `/compact` in the middle of a long task when context fills up. Add a focus hint, e.g. `/compact keep the failing test and the current issue's ACs`.
- `claude --continue` to resume the most recent session in this directory after quitting, e.g. to pick up an unfinished red/green cycle.
