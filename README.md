# Team Contribution Tracker

Shows how work is shared in student project teams, sprint by sprint, by combining
GitHub activity (PRs, reviews, commits) with private peer ratings. Staff see every
team and get flags for unbalanced teams. See [docs/PRD.md](docs/PRD.md).

CS6983 AI Coding · Project 3 · Yang (Samuel) Zhang & Yanni Zhao

## Stack

Next.js (App Router, TypeScript) · PostgreSQL + Prisma · Auth.js (GitHub) · Vitest · Vercel

## Run locally

```bash
npm install                # also generates the Prisma client
cp .env.example .env       # fill in DATABASE_URL, AUTH_SECRET, AUTH_GITHUB_ID/SECRET
npx prisma migrate dev     # create the tables
npm run dev                # http://localhost:3000
```

## Scripts

| Command                                   | What it does            |
| ----------------------------------------- | ----------------------- |
| `npm run dev`                             | Start the dev server    |
| `npm run lint` / `npm run typecheck`      | ESLint / `tsc --noEmit` |
| `npm run format` / `npm run format:check` | Prettier                |
| `npm test` / `npm run test:coverage`      | Vitest (with coverage)  |
