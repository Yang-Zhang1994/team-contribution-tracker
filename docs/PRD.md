# Team Contribution Tracker — Product Requirements

**Course:** CS6983 AI Coding · Project 3 (pair project)
**Authors:** Yang (Samuel) Zhang, Yanni Zhao
**Status:** Draft v0.2 · 2026-11-21

---

## 1. Problem

In pair and group software courses, instructors have to judge whether every partner contributed fairly. Our own course adjusts individual grades by up to ±10% when commit history or PR reviews show unbalanced work.

Today this is done by hand. Instructors and TAs open each team's repository, scroll through commits and PRs, and read peer evaluations collected in a separate tool. This is slow, so it is usually done only at the end of the project, when it is too late to fix the imbalance. Students have no early signal that their share is slipping, and raw GitHub numbers (commit counts) are easy to inflate and misleading on their own.

## 2. Target users and roles

| Role | Who | What they need |
|---|---|---|
| **Student** | A member of a project team | See their team's activity and their own share per sprint; submit private peer ratings; get warned early if the team is unbalanced |
| **Staff** (instructor or TA) | Runs the course | See every team at a glance; find unbalanced teams early; get evidence to back up a grade adjustment |

## 3. Goals, non-goals, anti-goals

**Goals**
- Show each member's contribution share per sprint, combining several GitHub signals with peer ratings.
- Flag unbalanced teams during the project, not only at the end.
- Give staff evidence (linked PRs, reviews, commits) for every flag.

**Non-goals**
- The app does **not** assign or change grades. Flags are prompts for a human to check.
- No support for GitLab, Bitbucket or non-Git work (design docs, meetings) in this version.
- No real-time updates; data is synced on demand or on a schedule.

**Anti-goals** (would make the product a failure even if it works)
- Rewarding commit spam: many tiny commits must not raise a share much.
- Leaking peer ratings: a student must never see who rated them what.

## 4. Contribution model

All metrics are computed per member, per team, per sprint window.

### 4.1 Signals

| Signal | Counted when | Timestamp used |
|---|---|---|
| PRs merged | Member authored a PR merged into the default branch | `merged_at` |
| Reviews given | Member submitted a review on a teammate's PR (not their own) | `submitted_at` |
| Commits | Non-merge commit on the default branch authored by the member | author date |
| Lines changed | Additions + deletions per commit, **capped at 300 per commit**, excluding lockfiles and generated files | author date |

Commits from bots (`*[bot]`) and merge commits are ignored. Commits whose author cannot be matched to a team member's GitHub account are listed as **unmatched** and not counted.

### 4.2 Contribution share

For each signal, a member's signal share = member value ÷ team total.
Overall share = weighted average of signal shares. Default weights:

| PRs merged | Reviews given | Commits | Lines changed |
|---|---|---|---|
| 0.35 | 0.25 | 0.15 | 0.25 |

The weights are fixed for every course in this version, so all teams are measured the same way.

If the team total for a signal is 0, that signal is skipped and the remaining weights are rescaled to sum to 1. If all signals are 0, every share is reported as "no activity" (not 0%).

### 4.3 Imbalance flag

Fair share = 1 ÷ team size. A team is flagged when any member's overall share differs from the fair share by more than the **threshold** (default 10 percentage points). For a pair, a split outside 40/60 is flagged.

### 4.4 Peer ratings

Each member rates each teammate (not themselves) from 1 to 5 on "contributed their fair share this sprint."
Normalized peer score = member's average rating received ÷ team mean of average ratings received. A score of 1.0 means "rated as average for this team." Missing ratings are shown as missing, never as 0.

Ratings for a sprint can be submitted from its start until its **rating deadline: 3 days after the sprint ends**.

A team is also flagged when a member's peer score is below 0.9 or the peer view and the GitHub view disagree (one says above fair share, the other below).

## 5. User stories

Each acceptance criterion (AC) is written to be testable.

### US1 — Sign in and get the right role
As a student or staff member, I want to sign in with GitHub, so that the app knows my GitHub identity and my role.
- AC1: Sign-in uses GitHub OAuth with the minimum scopes needed to read the linked repositories.
- AC2: A user who joins with a **staff code** gets the staff role for that course; a user who joins with a **student code** gets the student role.
- AC3: Signed-out users are redirected to sign-in from every page except the landing page.

### US2 — Set up a course, teams and sprints
As staff, I want to create a course with sprints, so that activity is measured in the right time windows.
- AC1: Staff can create, edit and delete sprints (name, start date, end date); sprints in one course cannot overlap.
- AC2: A sprint window includes its start and excludes its end (`start ≤ t < end`), in the course's time zone.
- AC3: Students can create or join a team inside the course and link exactly one GitHub repository to it. A team has 2 to 4 members.
- AC4: Staff can see and edit every team's members and repository.

### US3 — Sync repository activity
As a student or staff member, I want the app to pull the team's GitHub activity, so that contribution numbers are up to date.
- AC1: "Sync now" fetches merged PRs, reviews and default-branch commits since the last sync and stores them.
- AC2: Re-running a sync never creates duplicate records.
- AC3: Unmatched commit authors are listed for the team so they can be linked to a member.
- AC4: When GitHub returns a rate-limit or permission error, the sync stops cleanly and the page shows the reason and the time of the last successful sync.

### US4 — See contribution share per sprint
As a student, I want to see each member's contribution share for a sprint, so that I know early whether our work is balanced.
- AC1: The team page shows each member's overall share and each signal share for the selected sprint, computed as in §4.2.
- AC2: Lines changed are capped at 300 per commit, so one huge commit cannot dominate.
- AC3: Every number links to the PRs, reviews or commits behind it.

### US5 — Find unbalanced teams
As staff, I want a dashboard of all teams with imbalance flags, so that I can step in before the project ends.
- AC1: The dashboard lists every team with its members' shares for the selected sprint and a flag when §4.3 or §4.4 applies.
- AC2: Staff can change the threshold for the course (5–25 percentage points); flags update immediately. Signal weights cannot be changed.
- AC3: Each flag states its reason in plain words (e.g. "Alex: 28% share, fair share 50%").

### US6 — Submit private peer ratings
As a student, I want to rate my teammates each sprint in private, so that work GitHub can't see (design, testing, meetings) still counts.
- AC1: A student can submit and edit ratings for each teammate until the sprint's rating deadline; self-ratings are rejected.
- AC2: Students see only their own normalized peer score, never individual ratings or who gave them.
- AC3: Staff see all ratings for their course.
- AC4: The normalized peer score is computed as in §4.4.

### US7 — AI team summary (stretch, Agent SDK)
As staff, I want a short written summary of each member's work in a sprint, so that I can understand a flag without reading every PR.
- AC1: The summary is generated from the team's synced PR titles, descriptions and reviews only.
- AC2: Every claim in the summary links to the PR or review it came from.
- AC3: The summary is clearly labeled as AI-generated and never states a grade.

## 6. Security and privacy requirements

These are part of the Definition of Done for every story.
- **Access control (OWASP A01):** every API route checks the user's role and course/team membership on the server. A student can only read their own team's data and their own peer score.
- **Secrets:** GitHub OAuth secrets and tokens live only in environment variables; access tokens are never sent to the browser or logged.
- **Least privilege:** GitHub scopes are limited to what reading the linked repositories needs.
- **Input validation:** all request bodies are validated on the server (schema validation) before reaching the database.
- **Injection:** database access goes only through the ORM's parameterized queries.

## 7. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router), TypeScript |
| Database | PostgreSQL (Neon) with Prisma |
| Auth | Auth.js with the GitHub provider |
| GitHub data | GitHub REST/GraphQL API via Octokit |
| AI summary | Claude Agent SDK |
| Tests | Vitest (unit + integration), Playwright (E2E) |
| Hosting | Vercel (preview deploys on PRs, production on merge to `main`) |

## 8. Release plan

| Sprint | Dates | Scope |
|---|---|---|
| Sprint 1 | 2026-11-23 → 2026-12-04 | US1–US4: sign-in, course setup, GitHub sync, contribution share |
| Sprint 2 | 2026-12-05 → 2026-12-14 | US5–US6: staff dashboard, peer ratings; US7 if time allows |

## 9. Decisions

| Question | Decision | Why |
|---|---|---|
| Can staff change the signal weights? | No, only the imbalance threshold. | Fixed weights keep every team measured the same way and keep the model simple to test and explain. Configurable weights can come later. |
| When do peer ratings close? | 3 days after the sprint ends. | Gives students time to reflect on the finished sprint, and the last sprint (which has no next sprint) still gets a clear deadline. |
| Pairs only, or larger teams? | Teams of 2 to 4. | The formulas already work for any team size (fair share = 1 ÷ size), so supporting small groups costs little and makes the tool useful beyond pair courses. |
