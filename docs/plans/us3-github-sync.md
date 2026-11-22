# US3 — GitHub sync (branch `feat/1-github-sync`, closes #1)

## Context

Contribution shares (US4) and imbalance flags (US5) need each team's GitHub activity stored locally. US3 adds a "Sync now" action that pulls merged PRs, reviews and default-branch commits for a team's linked repository, stores them without duplicates, lists unmatched commit authors, and fails cleanly on rate-limit or permission errors (PRD §5 US3 AC1–AC4).

Decisions already made:

- **Public repos only.** Keep Auth.js's default GitHub scope (`read:user user:email`) and don't request `repo`. The user's token is only used to get the 5,000 requests/hour rate limit.
- **Token:** the token of the user who clicks "Sync now", read on the server from `Account.access_token`. It's never put in the session, never sent to the client and never logged.
- **Minimal Course / Team / Membership / Repository schema** in this branch, with no management UI (US2 adds that). A seed script makes sync testable.
- **One stored line total per commit,** with lockfiles and generated files excluded, computed by a pure function in `src/lib/`. **No 300-line cap when storing.** The cap belongs to US4.

Future option (not in this branch): a **GitHub App** with read-only Contents, Pull requests and Metadata permissions. It would allow private repos with least privilege, and installation tokens would allow a scheduled sync with no user present.

## What exists (from exploration)

- `src/auth.ts`: bare `NextAuth({ adapter: PrismaAdapter(prisma), providers: [GitHub] })` with database sessions. The default session callback (`@auth/core/lib/init.js:20`) only returns name, email and image, **so `session.user.id` is missing**.
- `Account.providerAccountId` = the user's numeric GitHub ID, and `Account.access_token` = their OAuth token. Both are written by the adapter's `linkAccount`.
- `src/server/db.ts`: shared `prisma` singleton. Import it, never `@prisma/client`.
- `prisma/schema.prisma` has only the Auth.js tables. **There's no `prisma/migrations/` directory yet.**
- `src/lib/` is empty. Octokit, `server-only` and `tsx` aren't installed.
- Next 16 docs: server actions can be reached by a direct POST, so each one must re-check auth. Use `refresh()` from `next/cache` after the mutation and `useActionState` for the pending state. `maxDuration` for actions is set on the page.

## Design

### Matching authors

Match on the **numeric GitHub user ID**. The GitHub API gives `author.id` for commits, `user.id` for PRs and reviews. A member's ID is their `Account.providerAccountId`. **Records don't store a user ID.** Matching happens when the data is read, through a pure function, so later membership changes or linking unmatched authors don't need a re-sync. This needs no change to `User`.

### Schema (`prisma/schema.prisma`)

- `Course { id, name, timeZone, createdAt, updatedAt }`
- `Membership { id, courseId, userId, role: Role (STAFF | STUDENT), teamId? }`, `@@unique([courseId, userId])`. A student is in at most one team per course.
- `Team { id, courseId, name }`, with relations to `Membership[]` and `Repository?`
- `Repository { id, teamId @unique, owner, name, defaultBranch?, lastSyncedAt?, lastSyncStartedAt?, lastSyncError?, lastSyncErrorAt? }`, `@@unique([owner, name])`. Sync state lives here, so there's no separate SyncRun table.
- `PullRequest { id, repositoryId, githubId BigInt @unique, number, authorGithubId BigInt?, authorLogin?, title, url, baseRef, mergedAt?, updatedAt }`, `@@unique([repositoryId, number])`. Unmerged PRs are stored too, so reviews on them have a parent.
- `Review { id, pullRequestId, githubId BigInt @unique, reviewerGithubId BigInt?, reviewerLogin?, state, url, submittedAt }`
- `Commit { id, repositoryId, sha, authorGithubId BigInt?, authorLogin?, authorName, authorEmail, authoredAt, linesChanged Int, url }`, `@@unique([repositoryId, sha])`
- Indexes on `(repositoryId, mergedAt)`, `(repositoryId, authoredAt)` and `(pullRequestId)` for US4 window queries.

**AC2 (no duplicates)** is guaranteed by these unique keys plus `upsert` on them.

### Pure domain logic in `src/lib/` (strict TDD, close to 100% coverage)

These modules take plain types defined there. Zod schemas parse the raw GitHub JSON, so `src/lib` never imports Octokit.

- `src/lib/github/files.ts`
  - `isExcludedFile(path)`: lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock(b)`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `go.sum`), generated or bundled files (`*.min.js`, `*.min.css`, `*.map`, `*.snap`, paths under `dist/`, `build/`, `.next/`, `coverage/`, `node_modules/`, `**/generated/**`).
  - `countLinesChanged(files)` = Σ(additions + deletions) over files that aren't excluded. Not capped.
- `src/lib/github/activity.ts`
  - `isBotAuthor(commit)`: login ending in `[bot]`, `type === "Bot"`, or, when there's no linked author, a git author name ending in `[bot]`.
  - `isMergeCommit(commit)`: more than one parent.
  - `toCommitRecord(commit, files)`: returns `null` for bot and merge commits.
  - `toPullRequestRecord(pr)`.
  - `toReviewRecord(review, prAuthorId)`: returns `null` for pending reviews (no `submitted_at`) and self-reviews.
  - `dedupeBy(key)`: drops duplicates within a batch, for example when pages overlap.
- `src/lib/github/unmatched.ts`: `findUnmatchedAuthors(commits, memberGithubIds)` returns one entry per distinct author (login, or name and email), with a commit count and the latest commit date.
- `src/lib/github/sync-window.ts`: `syncSince(lastSyncedAt, overlapHours = 24)` returns `null` for the first sync, which means a full history fetch. The overlap is safe because records are upserted.
- `src/lib/github/errors.ts`: `classifySyncError({ status, headers, message })` returns one of:
  - `rate_limited` (403/429 with `x-ratelimit-remaining: 0` or `retry-after`, with reset time)
  - `not_found_or_private` (404)
  - `forbidden` (403)
  - `unauthorized` (401, so the user needs to sign in again)
  - `unknown`

  Each kind has a plain-language message for the page.

- `src/lib/access.ts`: `canAccessTeam(membership, teamId)`. Students only for their own team, staff for any team in their course.

### Server code in `src/server/` (all files `import "server-only"`)

- `github-token.ts`: `getGitHubToken(userId)` runs `prisma.account.findFirst({ where: { userId, provider: "github" }, select: { access_token: true } })`. It throws a typed error if there's no token. **The only place that reads the token.**
- `github-client.ts`: wraps `@octokit/rest` behind a small `GitHubSource` interface:
  - `getRepo`
  - `listCommits(since)`, paginated, `sha=defaultBranch`
  - `getCommitFiles(sha)`
  - `listPullsUpdatedSince(since)`: `state=all`, `sort=updated`, `direction=desc`, stopping once `updated_at < since`, and keeping only `base === defaultBranch`
  - `listReviews(prNumber)`
- `sync.ts`: `runSync({ repo, source, store, now })` with injected dependencies, so it can be tested without a DB or network:
  1. Mark the sync as started.
  2. Fetch the repo and its default branch.
  3. Fetch PRs updated since the window start, then reviews for each.
  4. Fetch commits since the window start. Call `getCommitFiles` **only for SHAs not already stored**, to save rate limit.
  5. Map everything with the pure functions.
  6. Write it all in **one transaction** through `store.saveActivity`.
  7. Set `lastSyncedAt = startedAt` and clear the error.

  If anything fails, classify the error, call `store.recordFailure(kind, message, now)`, leave `lastSyncedAt` unchanged and write no partial data (AC4).

- `sync-store.ts`: the Prisma implementation of `store`, using upserts on the unique keys inside `prisma.$transaction`.
- `access.ts`: `requireTeamAccess(userId, teamId)` loads the membership through Prisma and calls `canAccessTeam`.

### Auth (`src/auth.ts`)

- Add a `callbacks.session` that sets `session.user.id = user.id`, plus a `next-auth` module augmentation for the type.
- No scope change.

### UI (minimal, only what sync needs)

- `src/app/teams/[teamId]/page.tsx`: a server component. Request-time reads go inside `<Suspense>`. It shows:
  - the repository (`owner/name`)
  - the last successful sync time
  - the last error and when it happened
  - counts of PRs, reviews and commits
  - the unmatched authors list (AC3)

  Set `export const maxDuration = 60`.

- `src/app/teams/[teamId]/actions.ts`: `"use server"` `syncTeam(prevState, formData)` does:
  1. `auth()`
  2. Zod-parse `teamId`
  3. `requireTeamAccess`
  4. `getGitHubToken`
  5. `runSync`
  6. `refresh()`

  It returns `{ ok: true } | { ok: false, reason }` and never includes the token or raw errors.

- `src/app/teams/[teamId]/sync-button.tsx`: a client component using `useActionState`, with a pending label.
- A signed-out user, or one who isn't a member, gets `notFound()` or a redirect from the page. The action returns an error instead.

### Seed script

- `prisma/seed.ts`, run through `tsx` and wired up as `migrations.seed: "tsx prisma/seed.ts"` in `prisma.config.ts`.
- It's idempotent (upserts):
  - one course
  - one team
  - a `Repository` from the `SEED_REPO=owner/name` env var
  - student memberships for every existing user with a GitHub `Account`, so you sign in first and then seed
  - optionally, `SEED_STAFF_GITHUB_ID` to make one of those users staff
- Add `SEED_REPO` to `.env.example`.
- The seed builds its own `PrismaClient` with `PrismaPg` on `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, the same fallback as `prisma.config.ts`. It does **not** import `src/server/db.ts`, because that pulls in `@vercel/functions`' `attachDatabasePool`.

> Update 2026-11-21: commit `5319473` (on `main` and this branch) already added the `init_auth` migration, Neon pooled/unpooled URLs and `GET /api/health`. Plan step 1 is done.

### Dependencies (`npm install` asks for permission)

- `@octokit/rest` and `server-only` (runtime)
- `tsx` (dev)

## Commit sequence (red, then green, then optional refactor, with each step its own commit)

1. `chore(db): initial migration for Auth.js tables` (`npx prisma migrate dev --name init`)
2. `chore: add @octokit/rest, server-only, tsx`
3. `feat(db): add course, team, membership, repository and activity models` and its migration (`--name github-sync`). This is schema only, with no test (it's declarative).
4. For each pure module, a `test:` commit then a `feat:` commit:
   - `files` (exclusions, line totals)
   - `activity` (bots, merges, self or pending reviews, dedupe)
   - `sync-window`
   - `errors`
   - `unmatched`
   - `access`
5. `test(sync)` / `feat(sync)`: tests for `runSync` with a fake `GitHubSource` and an in-memory `store`. They cover:
   - AC1: fetches since the last sync, with the overlap
   - AC2: running twice gives the same stored set, and commit files aren't fetched again
   - AC4: a rate limit midway leads to `recordFailure`, no `saveActivity`, and `lastSyncedAt` unchanged
6. `feat(server)`: the Prisma store, the token reader, the Octokit client and `requireTeamAccess`. Wiring code only; the logic is already covered by the tests.
7. `feat(auth): expose user id in session`
8. `feat(sync): team page with Sync now action and unmatched authors`
9. `chore(db): seed script for a course, team and public repo`

Test names follow the ACs, for example `describe("US3-AC2: re-running a sync never creates duplicates")` and `describe("US3-AC4: rate limit stops the sync and keeps last successful sync time")`. Edge cases: bot and merge commits, unmatched authors, self-reviews, pending reviews, lockfile-only commits (0 lines), first sync (no cursor), empty repo.

Before every commit: `npm run lint && npm run typecheck && npm test`.

## Verification

- `npm test` and `npm run test:coverage`: `src/lib/github/*` and `src/lib/access.ts` close to 100%, and 70% or more overall.
- `npm run lint`, `npm run typecheck`, `npm run build`.
- Manual end-to-end:
  1. Run `npx prisma migrate dev`.
  2. Sign in with GitHub on `npm run dev`.
  3. Set `SEED_REPO` to a small public repo and run `npx prisma db seed`.
  4. Open `/teams/<id>` and click "Sync now". Counts and the last-sync time appear.
  5. Click it again. The counts don't change (AC2).
  6. Commits by people who aren't members appear under unmatched authors (AC3).
  7. Point the repository at a missing or private repo and sync again. The page shows "repository not found or private", and the last-sync time stays the same (AC4).
- Grep check that `access_token` is only referenced in `src/server/github-token.ts` and that it's never passed to `console.*` or returned from actions.

## Not in this branch

- Linking unmatched authors to members (US2/US4)
- Scheduled or cron sync
- Handling force-pushed history (commits that vanish stay stored)
- Commits with more than 300 changed files (GitHub truncates the file list, so those are noted as undercounted)
- GitHub App migration
- Course and team management UI (US2)
- Share calculation and the 300-line cap (US4)
